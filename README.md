# Magic iOS26 Calculator (Spring Festival Gala style)

一个复刻 iOS 风格 UI 的“魔术计算器”网页版本。

## 功能

- iOS 风格计算器 UI（暗色、圆形按键、右侧橙色运算键）
- 基础计算：`+ - × ÷`、`AC`、`⌫`、`=`、`%`、`+/-`
- 支持 PWA（manifest + theme-color）
- 禁用静态缓存（`_headers` 设置 no-store，避免更新不及时）
- 魔术流程（两段式）：
  1. 第一段：输入若干数字并按 `+` 累加，得到 `R1`
  2. 当第 N 次输入按下 `+`（N=配置次数）时立即进入第二段
  3. 第二段：按任意键都会“吐出”预设 `R2` 的下一位
  4. `R1 + R2 = 本地时间 + 延时秒数`（格式：`M D HH mm` 拼接，如 `2162227`）

## 隐藏配置入口

在计算器键盘输入：

`88224466=`

打开配置页（iOS 抽屉样式）：

- 第一部分计划输入数字次数
- R2 值本地时间延时秒数（默认 20 秒）
- 调试信息开关（默认关闭）

配置保存在 `localStorage`。

## 本地运行

```bash
cd magic-ios26-calculator
python3 -m http.server 8787
# 浏览器打开 http://localhost:8787
```

## 部署到 Cloudflare Pages

### 方案 A：控制台直接部署（最简单）

1. 将本目录推到 GitHub 仓库
2. Cloudflare Pages -> Create project -> 连接 GitHub
3. Build command 留空
4. Build output directory 填 `.`
5. Deploy

### 方案 B：Wrangler CLI

```bash
npm i -g wrangler
cd magic-ios26-calculator
wrangler pages deploy . --project-name magic-ios26-calculator
```

## 开源建议

- LICENSE: MIT
- README 附上魔术流程演示 GIF
- 仓库 topics：`calculator` `magic` `ios-ui` `cloudflare-pages`
