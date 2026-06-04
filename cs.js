# =========================================
# 第一部分：我的订阅链接 (随时修改)
# =========================================
# 软件会自动下载这里的节点。
proxy-providers:
  订阅链接_1:
    type: http
    url: "https://misub-cvm.pages.dev/profiles/c8a5e921-359f-4f29-b317-6cf1d133a15d"
    path: ./proxies/sub_1.yaml
    interval: 3600 # 每隔 1 小时自动在后台更新一次节点
    health-check:
      enable: true
      url: http://connectivitycheck.gstatic.com/generate_204
      interval: 300 # 每 5 分钟测一下节点通不通

  订阅链接_2:
    type: http
    url: "https://misub-cvm.pages.dev/profiles/11759d50-e935-491b-ac74-235f785dd337" 
    path: ./proxies/sub_2.yaml
    interval: 3600
    health-check:
      enable: true
      url: http://connectivitycheck.gstatic.com/generate_204
      interval: 300

  订阅链接_3:
    type: http
    url: "https://internal-api-svc.wxhby.com/dist/7a9d2f/update/data?token=3fa851c97322b8c88d48da76ba6312c2" 
    path: ./proxies/sub_3.yaml
    interval: 3600
    health-check:
      enable: true
      url: http://connectivitycheck.gstatic.com/generate_204
      interval: 300

# =========================================
# 第二部分：本地节点 (你自己手动加的节点)
# =========================================
# 这里是你提供的三个 SS-2022 节点，我已经为你解密并排版好。
# 以后如果还有单节点，可以模仿这个格式粘贴在下面。
proxies:
  - name: "SG AWS"
    type: ss
    server: 13.228.144.232
    port: 24980
    cipher: 2022-blake3-aes-256-gcm
    password: "A7o/R+d5kvNZE3btpAEbwwYVfZYsIOKXEMO10pWl4z4="

  - name: "KR AWS"
    type: ss
    server: 54.116.198.87
    port: 11748
    cipher: 2022-blake3-aes-256-gcm
    password: "4or1y9PzE5Liw3qygvAw/Cq178/HSkOG/3HQ1A7KNSI="

  - name: "JP AWS"
    type: ss
    server: 18.181.126.25
    port: 21641
    cipher: 2022-blake3-aes-256-gcm
    password: "IIrxoWrI4OT1ZcKdM5we6eJThoAJ84VrE/c8lQrbOcc="

# =========================================
# 第三部分：节点分类与策略组 (你能在软件面板看到的部分)
# =========================================
proxy-groups:
  # --- 基础面板开关 ---
  - name: 节点选择
    type: select
    proxies:
      - 香港节点
      - 日本节点
      - 我的节点
    icon: https://github.com/h05n/tubiao/raw/main/Surge/Surge.png

  - name: 谷歌服务
    type: select
    proxies:
      - 节点选择
      - 香港节点
      - 日本节点
    icon: https://github.com/h05n/tubiao/raw/main/Surge/谷歌.png

  - name: 苹果服务
    type: select
    proxies:
      - DIRECT # 直连（不走代理）
      - 节点选择
      - 香港节点
      - 日本节点
    icon: https://github.com/h05n/tubiao/raw/main/Surge/苹果.png

  - name: 电报信息
    type: select
    proxies:
      - 节点选择
      - 香港节点
      - 日本节点
    icon: https://github.com/h05n/tubiao/raw/main/Surge/电报.png

  - name: 智能助理
    type: select
    proxies:
      - 节点选择
      - 香港节点
      - 日本节点
    icon: https://github.com/h05n/tubiao/raw/main/Surge/无限.png

  # --- 自动测速与节点汇总 ---
  - name: 香港节点
    type: url-test 
    use: [订阅链接_1, 订阅链接_2, 订阅链接_3] 
    filter: "(?i)(香港|Hong|HK)" 
    url: http://connectivitycheck.gstatic.com/generate_204
    interval: 300
    icon: https://github.com/h05n/tubiao/raw/main/Surge/香港.png

  - name: 日本节点
    type: url-test
    use: [订阅链接_1, 订阅链接_2, 订阅链接_3]
    proxies:
      - "JP AWS" # 已经将你的本地日本节点加入自动测速名单
    filter: "(?i)(日本|Japan|JP)" 
    url: http://connectivitycheck.gstatic.com/generate_204
    interval: 300
    icon: https://github.com/h05n/tubiao/raw/main/Surge/日本.png

  - name: 我的节点
    type: select 
    use: [订阅链接_1, 订阅链接_2, 订阅链接_3]
    proxies:
      - "SG AWS" # 你的本地节点在这里
      - "KR AWS" # 你的本地节点在这里
      - "JP AWS" # 你的本地节点在这里
    icon: https://github.com/h05n/tubiao/raw/main/Surge/我的节点.png

# =========================================
# 第四部分：分流规则清单 (软件去哪里找屏蔽列表)
# =========================================
rule-providers:
  Reject_Domain: 
    type: http
    behavior: domain
    url: "https://ruleset.skk.moe/List/domainset/reject.conf"
    path: ./rules/Reject_Domain.txt
    interval: 86400
    format: text

  Reject_NonIP: 
    type: http
    behavior: classical
    url: "https://ruleset.skk.moe/List/non_ip/reject.conf"
    path: ./rules/Reject_NonIP.txt
    interval: 86400
    format: text

  OpenAI: 
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/EAlyce/conf/refs/heads/main/Rule/OpenAI.list"
    path: ./rules/OpenAI.txt
    interval: 86400
    format: text

  Apple: 
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Apple/Apple_All_No_Resolve.list"
    path: ./rules/Apple.txt
    interval: 86400
    format: text

  GitHub:
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/GitHub/GitHub.list"
    path: ./rules/GitHub.txt
    interval: 86400
    format: text

  Telegram:
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Telegram/Telegram.list"
    path: ./rules/Telegram.txt
    interval: 86400
    format: text

  Google:
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Google/Google.list"
    path: ./rules/Google.txt
    interval: 86400
    format: text

  Proxy: 
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Proxy/Proxy_All_No_Resolve.list"
    path: ./rules/Proxy.txt
    interval: 86400
    format: text

  China: 
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/China/China_All_No_Resolve.list"
    path: ./rules/China.txt
    interval: 86400
    format: text

  ChinaASN: 
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/VirgilClyne/GetSomeFries/main/ruleset/ASN.China.list"
    path: ./rules/ChinaASN.txt
    interval: 86400
    format: text

# =========================================
# 第五部分：流量调度指挥 (谁走代理，谁直连)
# =========================================
rules:
  # 1. 局域网设备的流量，不需要翻墙，直接放行
  - GEOIP,LAN,DIRECT
  - GEOSITE,private,DIRECT

  # 2. 命中广告和恶意网址清单的，直接拦截
  - RULE-SET,Reject_Domain,REJECT
  - RULE-SET,Reject_NonIP,REJECT
  
  # 3. 指定服务走对应的策略组
  - RULE-SET,OpenAI,智能助理
  - RULE-SET,Apple,苹果服务
  - RULE-SET,GitHub,节点选择
  - RULE-SET,Telegram,电报信息
  - RULE-SET,Google,谷歌服务
  - RULE-SET,Proxy,节点选择
  
  # 4. 命中中国国内网址和 IP 的，直接放行不绕路
  - RULE-SET,China,DIRECT
  - RULE-SET,ChinaASN,DIRECT
  
  # 5. 上面所有情况都没碰上的其他流量，默认走代理
  - MATCH,节点选择

# =========================================
# 第六部分：底层运行设置 (基本不用管)
# =========================================
port: 7890
socks-port: 7891
mixed-port: 7897
allow-lan: false
mode: rule
log-level: info
ipv6: false
tcp-concurrent: true
find-process-mode: strict

hosts:
  '*.linkcubecloud.net': 61.172.235.61

dns:
  enable: true
  listen: 0.0.0.0:1053
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    - '+.msftncsi.com'
    - '+.msftconnecttest.com'
    - '+.srv.nintendo.net'
    - '+.stun.playstation.net'
    - 'xbox.*.microsoft.com'
    - '+.xboxlive.com'
    - '+.battlenet.com.cn'
    - '+.battlenet.com'
    - '+.blzstatic.cn'
    - '+.battle.net'
    - '+.turn.twilio.com'
    - '+.stun.twilio.com'
    - 'stun.syncthing.net'
    - 'stun.*'
    - '+.sslip.io'
    - '+.nip.io'
  nameserver:
    - 223.5.5.5 
    - 119.29.29.29 
    - https://dns.alidns.com/dns-query 
  fallback:
    - 8.8.8.8
    - 8.8.4.4
