# 飲控幫手

手機用靜態 PWA，用來記錄每日飲食、常吃品項的營養卡片，以及用 OpenAI API 產生簡短飲控建議。

## 使用方式

### 本機確認

1. 用瀏覽器開 `index.html`，或啟動本機 server：

   ```bash
   python3 -m http.server 8000
   ```

2. 打開 `http://localhost:8000/`。

### 手機使用

1. 部署到 GitHub Pages 後，用 iPhone Safari 或 Android Chrome 打開 Pages 網址。
2. 加到主畫面後會以 PWA 方式開啟。
3. 每台手機各自到「卡片區」新增常吃食物。
4. 到「飲食紀錄」新增當日已吃食物。
5. 到「概覽」輸入營養目標、基礎代謝率。
6. 如果要使用 AI 建言，在「API 設定」輸入 OpenAI API key 與模型名稱，之後按「AI 建言」。

## 注意事項

- 這是 GitHub Pages 可用的純前端 PWA，資料存於瀏覽器 `localStorage`，換裝置不會自動同步。
- 你和另一位使用者會各自有自己的卡片、紀錄、目標值與 API key。
- API key 只存在目前裝置的瀏覽器，不會寫入 repo。
- 靜態網頁沒有後端保護金鑰；目前做法適合自己裝置使用。若之後要多人或公開給不熟悉的人用，建議改成有後端的版本。
- AI 建言需要手機有網路；飲食紀錄和卡片編輯可在已快取後離線使用。
- PWA 快取版本在 `sw.js`、`index.html` 的 `?v=8`。部署後手機沒看到更新時，需同步調整版本。

## GitHub Pages

此 repo 已包含 `.github/workflows/pages.yml`。推到 GitHub 的 `main` 分支後，GitHub Actions 會部署根目錄到 Pages。
