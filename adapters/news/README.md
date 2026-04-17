# News Adapter

负责动态资讯抓取、RSS / 搜索源接入、资讯卡标准化。

第一批将从当前 `/Users/leo-jaeger/Documents/Playground/content-engine/scripts/fetch_news_sources.py`
和 `/Users/leo-jaeger/Documents/Playground/content-engine/scripts/build_news_pool.py` 迁移。

当前支持两类源：

- `google_news_search`：Google News RSS 搜索，适合做高相关热点补充
- `rss_url`：国内可直连的标准 RSS 源，作为不开梯子时的兜底资讯来源
