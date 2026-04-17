# Status Machine Contract

## 目标

统一 UI、主进程、工作流和状态文件对“成功/失败/已计划/已执行”的定义。

## 基本原则

- `planned != success`
- `ready != executed`
- `installed != logged_in != usable`
- UI 不允许自己猜成功，只能消费状态机结果

## 依赖状态

允许状态：

- `missing`
- `installing`
- `needs_login`
- `ready`
- `failed`

规则：

- `installing` 只能表示正在执行安装或登录动作
- `needs_login` 说明二进制已存在，但还不能用于真实执行
- `ready` 才表示当前依赖真的可用
- `failed` 必须带可解释的错误信息或日志线索

## 执行状态

建议统一为：

- `idle`
- `planned`
- `running`
- `completed`
- `failed`

规则：

- `planned` 只表示已经形成执行计划
- `completed` 才表示真实执行完成
- UI 不允许把 `planned` 渲染成“成功”

## 图片生成状态

建议统一为：

- `pending`
- `stale`
- `generating`
- `completed`
- `failed`

规则：

- brief 或上游变化后，旧图必须变成 `stale`
- 只有存在真实落盘图片时，才能进入 `completed`

## 视频生成状态

建议统一为：

- `pending`
- `running`
- `completed`
- `failed`

规则：

- 视频第一版只表示本地生成和展示，不等于进入发布链
- 只有存在真实落盘 mp4 文件时，才能进入 `completed`
- submit_id 只表示任务已提交，不能被 UI 渲染成最终成功

## 发布状态

建议统一为：

- `draft_ready`
- `publishing`
- `published`
- `failed`

规则：

- 有 3 张图且文案存在，最多只能到 `draft_ready`
- 真正平台返回成功后，才能写成 `published`
