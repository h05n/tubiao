WidgetMetadata = {
  "id": "bangdan",
  "title": "番剧榜单",
  "version": "1.0.0",
  "requiredVersion": "0.0.1",
  "description": "最新番剧",
  "author": "，",
  "site": "https://github.com/h05n/ForwardWidgets",
  "modules": [
    {
      "id": "animeRanking",
      "title": "最新番剧",
      "functionName": "moduleDiscover",
      "params": [
        { 
          "name": "n", 
          "title": "页码", 
          "type": "enumeration", 
          "value": "1", 
          "enumOptions": [
            { "title": "第 1 页", "value": "1" },
            { "title": "第 2 页", "value": "2" },
            { "title": "第 3 页", "value": "3" },
            { "title": "第 4 页", "value": "4" },
            { "title": "第 5 页", "value": "5" }
          ] 
        }
      ]
    }
  ]
};

async function moduleDiscover(p) {
  var today = new Date(Date.now() + 28800000).toISOString().split("T")[0];
  var page = p.n || "1";
  var sKey = "anime_storage_final_p" + page;

  var apiParams = {
    "language": "zh-CN",
    "include_image_language": "null,zh,ja",
    "sort_by": "first_air_date.desc",
    "region": "JP",
    "with_networks": "", 
    "with_genres": "16",
    "with_original_language": "ja",
    "include_adult": false,
    "vote_count.gte": 5,
    "first_air_date.lte": today,
    "page": page
  };

  try {
    var res = await Widget.tmdb.get("/discover/tv", {
      params: apiParams,
      cacheTime: 3600
    });
    
    var items = [];
    if (res && res.results) {
      items = res.results.filter(function(r) {
        return r.poster_path != null;
      }).map(formatItem);
    }
    
    if (items.length > 0) { 
      Widget.storage.set(sKey, items); 
    }
    return items;
  } catch (e) {
    var cached = Widget.storage.get(sKey);
    return cached || [];
  }
}

function formatItem(r) {
  var d = r.first_air_date || "";
  var year = d ? d.split("-")[0] : "";
  
  var title = r.name || "";
  var original = r.original_name || "";
  
  var hasChinese = /[\u4e00-\u9fa5]/.test(title);
  if (!hasChinese && original) {
    title = original;
  }
  
  if (!title) title = "Unknown";

  return {
    "id": String(r.id),
    "type": "tmdb",
    "title": title,
    "subtitle": year + " · 番剧",
    "posterPath": r.poster_path,   
    "backdropPath": r.backdrop_path, 
    "releaseDate": d,
    "mediaType": "tv"
  };
}
