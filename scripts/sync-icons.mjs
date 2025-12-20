import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * ==========================================================
 * ✅ 设计目标（满足你的硬约束）
 * 1) 输出保持旧结构：{ name, description, icons:[{name,url}] }
 * 2) URL 保持中文不编码 => 必须严格校验路径字符，否则 raw 链接可能不可用
 * 3) 排序完全确定性 => 同一批文件在哪跑都输出一致（避免偶发顺序漂移）
 * 4) 内容签名校验 => 扩展名与真实内容不匹配直接失败（防伪装后缀）
 * 5) B 规则：纯数字文件名当序号 idx 排序（不改文件名、不补号）
 * 6) 不引入额外配置文件；不做体积限制；不强制缺号失败
 *
 * ✅ 本版额外防坑（“检查错误/冲突点”）
 * - 禁止 symlink（符号链接）避免怪问题
 * - 清理零宽/不可见字符：避免“看起来一样但其实不同”的隐形冲突
 * - 检查 Windows 保留名（CON/PRN/AUX/NUL/COM1…）避免未来工具链踩坑
 * - 同名同 idx 冲突直接失败（保证语义与排序都明确）
 * ==========================================================
 */

/** 仓库信息：raw 链接拼接用（如你改仓库/分支，这三行跟着改） */
const OWNER = "h05n";
const REPO = "tubiao";
const BRANCH = "main";

/** 输入/输出 */
const ICON_DIR = "图标库";
const JSON_PATH = "图标库.json";

/** 输出头（你可自行改） */
const LIB_NAME = "图标库";
const DESCRIPTION = "作者：，";

/** B 规则：根目录纯数字文件名默认归组 */
const DEFAULT_NUMERIC_GROUP = "默认";

/**
 * ✅ 为稳健性只放最常用格式（你确定软件支持更多时再加）
 * 注意：扩展名列表是“收录范围”，不代表软件一定支持所有格式。
 */
const ALLOWED_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".gif",
  ".avif",
]);

/** URL 不编码时必须禁止的字符（否则 raw 链接可能断/截断/被当参数） */
const BAD_URL_CHARS_RE = /[\s#?%&+\\]/;
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;
const WINDOWS_FORBIDDEN_RE = /[<>:"|*]/;

/**
 * ✅ 零宽/不可见字符（肉眼看不出来，但会导致：
 * - 分组名看起来一样，实际不同
 * - 搜索/排序异常
 * 这里直接移除，不会改变 URL，只会让 name 更符合直觉
 */
const ZERO_WIDTH_RE = /[\u200B-\u200F\uFEFF\u2060\u180E]/g;

/** Windows 保留名（某些同步/工具链会炸，提前拦截更省事） */
const WINDOWS_RESERVED_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

/** 读取文件头用于内容签名校验：只读头部更稳更省 */
const SIGNATURE_READ_BYTES = 64 * 1024;

/** 中文自然排序：numeric:true 保证 9 < 10 < 11 */
const collator = new Intl.Collator("zh", { numeric: true, sensitivity: "base" });

/** 归一化：NFKC + 全角数字转半角 + 移除零宽字符 */
function normalizeText(s) {
  const nfkc = (s ?? "").normalize("NFKC");
  const half = nfkc.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  return half.replace(ZERO_WIDTH_RE, "");
}

function isIconFileName(fileName) {
  if (!fileName || fileName.startsWith(".")) return false;
  return ALLOWED_EXTS.has(path.extname(fileName).toLowerCase());
}

/**
 * 强确定性递归扫描：
 * - 目录项排序后再遍历
 * - 输出统一为 "/" 路径
 * - 最终列表再排序一次做双保险
 */
function listIconRelPathsRecursive(iconDir) {
  const out = [];

  const walk = (dir, baseDir) => {
    let entries = fs.readdirSync(dir, { withFileTypes: true });
    entries = entries.sort((a, b) => collator.compare(a.name, b.name));

    for (const e of entries) {
      if (e.name.startsWith(".")) continue;

      const full = path.join(dir, e.name);

      if (e.isDirectory()) {
        walk(full, baseDir);
      } else if (e.isFile() && isIconFileName(e.name)) {
        const rel = path.relative(baseDir, full).split(path.sep).join("/");
        out.push(rel);
      }
    }
  };

  walk(iconDir, iconDir);
  out.sort((a, b) => collator.compare(a, b));
  return out;
}

/**
 * 解析 name + idx（idx 只用于排序，不写入 JSON）
 * 支持：
 * - xxx(12) / xxx（12）
 * - xxx_12 / xxx-12 / xxx 12
 * - xxx12
 * - B：纯数字（123）=> idx=123，name 用 fallback
 */
function parseNameAndIndexFromStem(stemRaw, fallbackNameForPureNumber) {
  const stem = normalizeText(stemRaw).trim();

  if (/^\d+$/.test(stem)) {
    return { baseName: fallbackNameForPureNumber, idx: Number(stem) };
  }

  let m = stem.match(/^(.*?)[（(]\s*(\d+)\s*[)）]\s*$/);
  if (m) return { baseName: m[1].trim(), idx: Number(m[2]) };

  m = stem.match(/^(.*?)(?:[\s_-]+)(\d+)\s*$/);
  if (m) return { baseName: m[1].trim(), idx: Number(m[2]) };

  m = stem.match(/^(.*?)(\d+)\s*$/);
  if (m && m[1].trim().length > 0) return { baseName: m[1].trim(), idx: Number(m[2]) };

  return { baseName: stem, idx: null };
}

/**
 * URL 不编码时的路径校验（非常关键）
 * - 禁止危险字符
 * - 禁止 . / .. 段
 * - 禁止尾随空格/点（跨平台坑）
 * - 禁止 Windows 保留名（更少未来踩坑）
 */
function validateRelPath(rel) {
  if (!rel || typeof rel !== "string") return "路径为空或不是字符串";
  if (CONTROL_CHARS_RE.test(rel)) return "包含控制字符（不可见）";
  if (BAD_URL_CHARS_RE.test(rel)) return "包含危险字符（空白或 # ? % & + \\ 等）";
  if (WINDOWS_FORBIDDEN_RE.test(rel)) return "包含 Windows 不允许字符（<>:\"|*）";
  if (rel.includes("//")) return "包含重复分隔符 //";

  const segs = rel.split("/");

  if (segs.some((s) => s.length === 0)) return "包含空路径段";
  if (segs.some((s) => s === "." || s === "..")) return "包含非法路径段 . 或 ..";
  if (segs.some((s) => s.endsWith(" ") || s.endsWith("."))) return "某个路径段以空格或点结尾";

  // Windows 保留名（忽略大小写）；像 "CON.txt" 也算保留名
  for (const seg of segs) {
    const base = seg.split(".")[0];
    const upper = normalizeText(base).trim().toUpperCase();
    if (WINDOWS_RESERVED_NAMES.has(upper)) return `包含 Windows 保留名路径段：${seg}`;
  }

  return null;
}

/**
 * ==========================================================
 * 内容签名校验（扩展名 <-> 实际内容）
 * - PNG/JPEG/GIF/WEBP：二进制头
 * - SVG：文本里搜 <svg（宽容）
 * - AVIF：必须 ISOBMFF 且 ftyp brands 包含 avif/avis
 * ==========================================================
 */

function parseFtypBrands(buf) {
  if (!buf || buf.length < 16) return [];
  if (buf.slice(4, 8).toString("ascii") !== "ftyp") return [];

  const size = buf.readUInt32BE(0);
  const boxLen = size >= 16 && size <= buf.length ? size : Math.min(buf.length, 256);

  const brands = [];
  brands.push(buf.slice(8, 12).toString("ascii"));
  for (let off = 16; off + 4 <= boxLen; off += 4) {
    brands.push(buf.slice(off, off + 4).toString("ascii"));
  }
  return [...new Set(brands.filter(Boolean))];
}

function sniffKind(buf) {
  if (!buf || buf.length < 12) return { kind: "unknown" };

  if (buf.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))) return { kind: "png" };
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return { kind: "jpeg" };

  const head6 = buf.slice(0, 6).toString("ascii");
  if (head6 === "GIF87a" || head6 === "GIF89a") return { kind: "gif" };

  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return { kind: "webp" };

  if (buf.slice(4, 8).toString("ascii") === "ftyp") return { kind: "isobmff", brands: parseFtypBrands(buf) };

  const text = buf.toString("utf8");
  if (/<svg[\s>]/i.test(text)) return { kind: "svg" };

  return { kind: "unknown" };
}

function expectedKindByExt(ext) {
  switch (ext) {
    case ".png": return "png";
    case ".jpg":
    case ".jpeg": return "jpeg";
    case ".gif": return "gif";
    case ".webp": return "webp";
    case ".svg": return "svg";
    case ".avif": return "avif";
    default: return "unknown";
  }
}

function readFileHead(absPath, maxBytes) {
  const fd = fs.openSync(absPath, "r");
  try {
    const buf = Buffer.allocUnsafe(maxBytes);
    const bytes = fs.readSync(fd, buf, 0, maxBytes, 0);
    return buf.subarray(0, bytes);
  } finally {
    fs.closeSync(fd);
  }
}

function sha1File(absPath) {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash("sha1").update(buf).digest("hex");
}

function atomicWriteFile(filePath, content) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

function selfCheckOutput(obj) {
  if (!obj || typeof obj !== "object") throw new Error("输出不是对象");
  if (obj.name !== LIB_NAME) throw new Error("name 不符合固定值");
  if (obj.description !== DESCRIPTION) throw new Error("description 不符合固定值");
  if (!Array.isArray(obj.icons)) throw new Error("icons 不是数组");
  if (obj.icons.length === 0) throw new Error("icons 为空");

  const seen = new Set();
  for (const [i, it] of obj.icons.entries()) {
    if (!it || typeof it !== "object") throw new Error(`icons[${i}] 不是对象`);
    if (typeof it.name !== "string" || !it.name.trim()) throw new Error(`icons[${i}].name 为空`);
    if (typeof it.url !== "string" || !it.url.trim()) throw new Error(`icons[${i}].url 为空`);
    if (seen.has(it.url)) throw new Error(`icons 存在重复 url：${it.url}`);
    seen.add(it.url);
  }
}

function printLimited(list, limit, printer) {
  const n = Math.min(limit, list.length);
  for (let i = 0; i < n; i++) printer(list[i]);
  if (list.length > limit) printer(`  ...（以及 ${list.length - limit} 个未显示）`);
}

/**
 * ==========================================================
 * 主流程
 * ==========================================================
 */
if (!fs.existsSync(ICON_DIR) || !fs.statSync(ICON_DIR).isDirectory()) {
  console.error(`❌ 未找到目录：${ICON_DIR}`);
  process.exit(1);
}

const relPaths = listIconRelPathsRecursive(ICON_DIR);
if (relPaths.length === 0) {
  console.error(`❌ 未扫描到任何图标文件（检查 ${ICON_DIR}/ 目录与扩展名）`);
  process.exit(1);
}

// 路径校验（不通过就失败）
const bad = [];
for (const rel of relPaths) {
  const reason = validateRelPath(rel);
  if (reason) bad.push({ rel, reason });
}
if (bad.length > 0) {
  console.error("❌ 发现危险文件名/路径（URL 不编码会导致访问失败/异常）：");
  for (const x of bad) console.error(`  - ${x.rel}（原因：${x.reason}）`);
  console.error("✅ 请改名后重新上传。建议只用：中文/英文/数字/下划线/短横线/括号。");
  process.exit(1);
}

const absRoot = path.resolve(ICON_DIR);

const items = [];                 // [{name, idx, rel, url}]
const dupMap = new Map();         // sha1 -> [rel...]
const nameIdxMap = new Map();     // name#idx -> [rel...]
const nullIdxNameCount = new Map(); // name -> count（用于提示）

for (const rel of relPaths) {
  const fileName = path.basename(rel);
  const ext = path.extname(fileName).toLowerCase();
  const stem = path.basename(fileName, ext);

  const abs = path.join(absRoot, rel.split("/").join(path.sep));

  // 禁止 symlink（避免怪行为）
  const lst = fs.lstatSync(abs);
  if (lst.isSymbolicLink()) {
    console.error(`❌ 不允许符号链接（symlink）：${rel}`);
    console.error("✅ 请改为真实文件（直接上传图片）。");
    process.exit(1);
  }

  // 空文件直接失败
  if (lst.size === 0) {
    console.error(`❌ 空文件（0字节）：${rel}`);
    process.exit(1);
  }

  // fallbackName：子目录名 or 默认组
  const dir = path.posix.dirname(rel);
  const fallbackName =
    dir && dir !== "."
      ? normalizeText(path.posix.basename(dir)).trim() || DEFAULT_NUMERIC_GROUP
      : DEFAULT_NUMERIC_GROUP;

  const { baseName, idx } = parseNameAndIndexFromStem(stem, fallbackName);
  const name = normalizeText(baseName).trim();
  if (!name) {
    console.warn(`⚠️ 跳过：无法解析 name（文件：${rel}）`);
    continue;
  }

  // 内容签名校验：只读文件头
  const head = readFileHead(abs, SIGNATURE_READ_BYTES);
  const sniff = sniffKind(head);
  const expected = expectedKindByExt(ext);

  let ok = true;
  if (expected === "avif") {
    if (!(sniff.kind === "isobmff" && Array.isArray(sniff.brands))) ok = false;
    else {
      const brands = sniff.brands.map(String);
      if (!brands.includes("avif") && !brands.includes("avis")) ok = false;
    }
  } else if (expected === "svg") {
    ok = sniff.kind === "svg";
  } else if (expected !== "unknown") {
    ok = sniff.kind === expected;
  }

  if (!ok) {
    console.error(`❌ 扩展名与内容不匹配：${rel}`);
    console.error(`   扩展名期望：${expected}，内容识别：${sniff.kind}${sniff.brands ? ` (brands: ${sniff.brands.join(",")})` : ""}`);
    console.error("✅ 请把文件转成正确格式，或改成正确扩展名后重新上传。");
    process.exit(1);
  }

  // raw URL：保持中文不编码
  const relPathForUrl = path.posix.join(ICON_DIR, rel);
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${relPathForUrl}`;

  items.push({ name, idx, rel, url });

  // 同名同 idx 冲突：收集后统一失败
  if (idx !== null) {
    const k = `${name}#${idx}`;
    if (!nameIdxMap.has(k)) nameIdxMap.set(k, []);
    nameIdxMap.get(k).push(rel);
  } else {
    nullIdxNameCount.set(name, (nullIdxNameCount.get(name) ?? 0) + 1);
  }

  // 重复内容提示（不失败）
  const h = sha1File(abs);
  if (!dupMap.has(h)) dupMap.set(h, []);
  dupMap.get(h).push(rel);
}

// 同名同序号冲突 => 失败（确定性/语义清晰关键）
const conflicts = [];
for (const [k, list] of nameIdxMap.entries()) {
  if (list.length > 1) conflicts.push({ k, list });
}
if (conflicts.length > 0) {
  console.error("❌ 发现同名同序号冲突（请删除/改名重复文件）：");
  for (const c of conflicts) console.error(`  - ${c.k}: ${c.list.join(" , ")}`);
  process.exit(1);
}

if (items.length === 0) {
  console.error("❌ 没有有效图标项（请检查命名与扩展名）");
  process.exit(1);
}

// 重复内容仅提示
const dupGroups = [];
for (const [, list] of dupMap.entries()) if (list.length > 1) dupGroups.push(list);
if (dupGroups.length > 0) {
  console.warn("⚠️ 发现重复内容（文件内容完全一致），建议清理重复上传：");
  printLimited(dupGroups, 20, (g) => {
    const shown = g.slice(0, 20);
    console.warn(`  - ${shown.join(" , ")}${g.length > 20 ? ` ...（该组还有 ${g.length - 20} 个）` : ""}`);
  });
}

// 同名无序号过多提示（不失败）
for (const [name, cnt] of nullIdxNameCount.entries()) {
  if (cnt >= 2) {
    console.warn(`⚠️ [提示] 分组「${name}」存在 ${cnt} 个“无序号”文件（排序主要靠路径兜底）。`);
  }
}

/** 完全确定性排序 */
items.sort((a, b) => {
  const ap = a.name === DEFAULT_NUMERIC_GROUP ? 0 : 1;
  const bp = b.name === DEFAULT_NUMERIC_GROUP ? 0 : 1;
  if (ap !== bp) return ap - bp;

  const n = collator.compare(a.name, b.name);
  if (n !== 0) return n;

  const ai = a.idx === null ? -1 : a.idx;
  const bi = b.idx === null ? -1 : b.idx;
  if (ai !== bi) return ai - bi;

  return collator.compare(a.rel, b.rel);
});

// 输出旧结构
const output = {
  name: LIB_NAME,
  description: DESCRIPTION,
  icons: items.map(({ name, url }) => ({ name, url })),
};

// 自检
try {
  selfCheckOutput(output);
} catch (e) {
  console.error(`❌ 输出自检失败：${e?.message ?? e}`);
  process.exit(1);
}

// 原子写入
atomicWriteFile(JSON_PATH, JSON.stringify(output, null, 2) + "\n");

// 统计日志（只影响日志，不影响文件）
const groupCounts = new Map();
for (const it of items) groupCounts.set(it.name, (groupCounts.get(it.name) ?? 0) + 1);

const topGroups = [...groupCounts.entries()]
  .sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))
  .slice(0, 8)
  .map(([k, v]) => `${k}(${v})`)
  .join("  ");

console.log(`✅ Updated ${JSON_PATH}: ${output.icons.length} icons`);
console.log(`ℹ️ 分组数：${groupCounts.size}`);
console.log(`ℹ️ Top 分组：${topGroups || "(无)"}`);
console.log(`ℹ️ 规则：URL不编码+路径强校验+零宽清理+symlink禁止+内容签名校验+冲突失败+确定性排序`);
