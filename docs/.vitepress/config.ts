import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";
import { teekConfig } from "./teek-config";
// 本地 Teek 主题包引用（与 Teek 在线主题包引用 二选一）
import { version } from "../../packages/teek/version";

// Teek 在线主题包引用（需安装 Teek 在线版本）
// import { version } from "vitepress-theme-teek/es/version";

const description = [
  "欢迎来到 芙宁娜西妲 的 提瓦特大陆",
  "前端开发技术分享站，分享前端技术笔记、实战经验与学习心得。学习，AI学习，Html学习，Css学习，JS学习，TS学习，Vue学习，Webpack学习，Vite学习，Uniapp学习，小程序学习，后端学习，Java学习，Tomcat学习，Nginx学习，Mysql学习，数据库学习，Linux学习，PHP学习，建站学习",
  "间或更新原神杂谈与日常随想，用代码构建世界。欢迎一起交流前端与生活。",
].toString();

// https://vitepress.dev/reference/site-config​
export default defineConfig({
  extends: teekConfig,
  title: "芙宁娜西妲 的 提瓦特大陆",
  description: description,
  cleanUrls: true,
  lastUpdated: true,
  // 语言 zh-CN | en
  lang: "zh-CN",
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/teek-logo-mini.svg" }],
    ["link", { rel: "icon", type: "image/png", href: "/teek-logo-mini.png" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:locale", content: "zh-CN" }],
    ["meta", { property: "og:title", content: "Tbagr | 芙宁娜西妲 的 提瓦特大陆" }],
    ["meta", { property: "og:site_name", content: "The Teyvat of FuRiNaHiNa" }],
    ["meta", { property: "og:image", content: "https://tbagr.com/teek-logo-large.png" }],
    ["meta", { property: "og:url", content: "https://tbagr.com" }],
    ["meta", { property: "og:description", description }],
    // 禁止浏览器缩放
    // [
    //   "meta",
    //   {
    //     name: "viewport",
    //     content: "width=device-width,initial-scale=1,minimum-scale=1.0,maximum-scale=1.0,user-scalable=no",
    //   },
    // ],
    ["meta", { name: "author", content: "Tbagr" }],
    ["meta", { name: "description", description }],
    ["meta", { name: "keywords", description }],
    ["meta", { name: "baidu-site-verification", content: "codeva-pwbE7jutKG" }], // 百度收录
    ["meta", { name: "algolia-site-verification", content: "4E82843E310768DD" }], // algolia 收录验证
    ["meta", { name: "msvalidate.01", content: "48CABE70F538B8D117567176ABF325AF" }], // Bing 收录验证
    ["script", { charset: "UTF-8", id: "LA_COLLECT", src: "//sdk.51.la/js-sdk-pro.min.js" }], // 51.la
    [
      "script",
      {},
      `typeof LA !== 'undefined' && LA.init({ id: "3LqfP8Icg0GeEvtn", ck: "3LqfP8Icg0GeEvtn", hashMode: true })`,
    ], // 51.la
  ],
  markdown: {
    // 开启行号
    lineNumbers: true,
    image: {
      // 默认禁用；设置为 true 可为所有图片启用懒加载。
      lazyLoading: true,
    },
    // 更改容器默认值标题
    container: {
      tipLabel: "提示",
      warningLabel: "警告",
      dangerLabel: "危险",
      infoLabel: "信息",
      detailsLabel: "详细信息",
    },
  },
  sitemap: {
    hostname: "https://tbagr.com",
    transformItems: items => {
      const permalinkItemBak: typeof items = [];
      // 使用永久链接生成 sitemap
      const permalinks = (globalThis as any).VITEPRESS_CONFIG.site.themeConfig.permalinks;
      items.forEach(item => {
        const permalink = permalinks?.map[item.url.replace(".html", "")];
        if (permalink) permalinkItemBak.push({ url: permalink, lastmod: item.lastmod });
      });
      return [...items, ...permalinkItemBak];
    },
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    // siteTitle: 'My Custom Title', // 等同上面的title参数
    logo: "/teek-logo-mini.svg",
    darkModeSwitchLabel: "主题",
    sidebarMenuLabel: "菜单",
    returnToTopLabel: "返回顶部",
    lastUpdatedText: "上次更新时间",
    outline: {
      level: [2, 4],
      label: "本页导航",
    },
    docFooter: {
      prev: "上一页",
      next: "下一页",
    },
    nav: [
      { text: "首页", link: "/" },
      {
        text: "文档",
        items: [
          {
            text: "首页(旧​)",
            link: "/home",
          },
          {
            text: "指南",
            link: "/guide/intro",
            activeMatch: "/01.指南/",
          },
          { text: "配置", link: "/reference/config", activeMatch: "/10.配置/" },
          { text: "开发", link: "/develop/intro", activeMatch: "/15.主题开发/" },
          {
            text: "资源",
            items: [
              { text: "案例", link: "/resources/case" },
              { text: "常见问题", link: "/resources/qa" },
              { text: "功能拓展", link: "/resources/expand/intro" },
            ],
          },
          {
            text: "生态",
            items: [
              { text: "Components 组件", link: "/ecosystem/components" },
              { text: "运行时 API", link: "/ecosystem/runtime-api" },
              { text: "Helper 工具", link: "/ecosystem/helper" },
              { text: "Composables 函数", link: "/ecosystem/composables" },
              { text: "Markdown 插件工具", link: "/ecosystem/md-plugin-utils" },
            ],
          },
          {
            text: "功能页",
            items: [
              { text: "归档页", link: "/archives" },
              { text: "清单页", link: "/articleOverview" },
              { text: "登录页", link: "/login" },
              { text: "风险链接提示页", link: "/risk-link?target=https://tbagr.com" },
              { text: "分类页", link: "/categories" },
              { text: "标签页", link: "/tags" },
            ],
          },
          // { text: "✨ 赞赏", link: "/personal/" },
          // {
          //   text: version,
          //   items: [
          //     { text: "历史版本", link: "https://github.com/tbagr/vitepress-theme-teek/releases" },
          //     { text: "更新日志", link: "https://github.com/tbagr/vitepress-theme-teek/blob/dev/CHANGELOG.md" },
          //   ],
          // },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/tbagr/vitepress-theme-teek" }],
    search: {
      provider: "algolia",
      options: {
        appId: "2LFTZ9LKO9",
        apiKey: "017332fa7dc0bbe5e1637b215f92a5d1",
        indexName: "vitepress_theme_teek",
      },
    },
    editLink: {
      text: "在 GitHub 上编辑此页",
      pattern: "https://github.com/tbagr/vitepress-theme-teek/edit/tbagr/docs/:path",
    },
  },
  vite: {
    plugins: [llmstxt() as any],
  },
  // transformHtml: (code, id, context) => {
  //   if (context.page !== "404.md") return code;
  //   return code.replace("404 | ", "");
  // },
});
