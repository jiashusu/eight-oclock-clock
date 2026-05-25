# 8点时钟

一个手机友好的本地网页 App。起床后点击“我醒了”，那一刻会被定义为你的早上 8:00；页面会实时显示你的个人时间、秒数、当前阶段、一天进度、最近起床记录和简单统计。

## 在线访问

https://eight-oclock-clock.vercel.app

## 运行

```bash
npm install
npm run dev
```

打开终端显示的本地地址，默认是：

```text
http://127.0.0.1:5173/
```

## 构建检查

```bash
npm run lint
npm run build
```

## 数据说明

记录会先保存在当前浏览器的 `localStorage` 中，并通过 Vercel Blob 同步到项目云端。每个浏览器会生成一个匿名设备 ID；同一浏览器重新打开时会从云端恢复记录。
