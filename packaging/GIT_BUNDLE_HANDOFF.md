# Git Bundle 交接说明

当前还没有共同的远程 Git 仓库，所以先用 `git bundle` 作为临时协作方案。

## 发送方

- 在本地初始化 `product-studio` 独立仓库
- 做第一笔 commit
- 导出一个 `.bundle` 文件给协作者

## 接收方

拿到 `.bundle` 后，在 Windows 上执行：

```bash
git clone Ransebao-Product-Studio.bundle product-studio
cd product-studio
git branch
```

如果需要继续开发：

```bash
cd desktop-app
npm install
npm start
```

## 当前说明

- 这不是长期方案
- 长期仍建议迁到共同的 GitHub / Gitee / GitLab 仓库
- 但在现在没有共同远程仓库时，`git bundle` 已经足够用来完整传代码和保留提交历史
