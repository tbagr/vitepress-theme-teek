export interface PermalinkOption {
  /**
   * 忽略的文件/文件夹列表，支持正则表达式
   *
   * @default []
   */
  ignoreList?: Array<RegExp | string>;
  /**
   * 文章所在的目录，基于 .vitepress 目录层级添加，开头不需要有 /
   * @default 'vitepress 的 srcDir 配置项'
   */
  path?: string;
  /**
   * dev 环境下监听 .md 文件的新增、删除、修改（如 permalink 属性变更），实时重启 dev server 重新注入 permalink 数据
   *
   * @default true
   */
  restart?: boolean;
}

export interface Permalink {
  /**
   * key 为文件相对路径，value 为永久链接
   */
  map: Record<string, string>;
  /**
   * key 为永久链接，value 为文件相对路径
   */
  inv: Record<string, string>;
}
