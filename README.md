# 筠筠的跳棋

一个可以直接放到 GitHub Pages 的网页跳棋。支持本机双人，也支持用 Firebase Realtime Database 开在线房间。

## 本地打开

直接用浏览器打开 `index.html` 即可；如果要测试在线房间，建议用本地网页服务打开，因为 Firebase 模块在部分浏览器里不喜欢 `file://` 页面。

## 在线房间

当前网页已经内置 Firebase 配置。打开在线模式后，创建房间并把邀请链接发给对方即可。

## Firebase 设置

如果之后要换成新的 Firebase 项目，可以打开游戏里的“Firebase 配置”，粘贴新 Web App 配置并保存。个人测试可以先使用下面的 Realtime Database 规则。公开网页上线后，建议再收紧规则。

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

## GitHub Pages

发布到 GitHub 新仓库后，在仓库的 `Settings` -> `Pages` 里选择 `main` 分支和根目录。保存后 GitHub 会生成网页地址。

## 文件

- `index.html`：页面结构
- `styles.css`：界面样式
- `app.js`：棋盘规则、本机双人和 Firebase 房间
