# 基于小米 MiMo V2.5 的语音输入法

基于小米 MiMo V2.5 多模态 API 的 Windows 语音输入助手。

这个项目目前是一个 Electron MVP，不是真正的 Windows 输入法驱动。它的工作方式是：按全局快捷键录音，把音频发给 MiMo，拿到转写文本并做清理，然后写入剪贴板，并尝试粘贴到之前光标所在的应用里。

英文文档见：[README.md](README.md)

## 致谢

感谢小米 MiMo 与 MiMo 万亿 Token 计划，让个人开发者也能更方便地探索和使用高能力多模态模型。

## 功能

- 全局快捷键呼出录音
- 小型悬浮录音状态窗
- 任务栏托盘菜单进入设置
- 可配置 API Key、Base URL、快捷键、麦克风和转写模式
- 对 `tp-` Token Plan Key 自动选择 Token Plan URL
- 转写后写入剪贴板并尝试粘贴到原焦点应用
- 默认使用两段式 Stable 模式：先原始转写，再文本清理
- 本地兜底清理常见口头填充词、重复片段和提示词泄漏式输出

## 安装

需要：

- Windows
- Node.js 20 或更新版本
- npm

安装依赖：

```powershell
npm install
```

可选环境变量文件：

```powershell
Copy-Item .env.example .env
```

程序可以读取 Windows 环境变量中的 `MIMO_API_KEY` 和 `MIMO_BASE_URL`。也可以在设置界面里填写 Key 和 URL。

## 启动

无控制台窗口双击启动：

```text
Start MiMo Voice Input.vbs
```

带调试控制台双击启动：

```text
Start MiMo Voice Input.cmd
```

命令行启动：

```powershell
$env:MIMO_API_KEY="your_api_key"
$env:MIMO_BASE_URL="https://token-plan-cn.xiaomimimo.com/v1"
npm start
```

如果使用 `tp-xxxxx` 形式的 Token Plan Key，程序默认使用：

```text
https://token-plan-cn.xiaomimimo.com/v1
```

如果服务商页面显示了其他集群地址，请在设置中或通过 `MIMO_BASE_URL` 改成对应 URL。

## 使用

1. 启动程序。
2. 右键任务栏托盘图标，打开 `Settings`。
3. 设置 API 凭证、麦克风和全局快捷键。
4. 按全局快捷键呼出录音窗口。
5. 悬浮窗显示 `Recording` 时开始说话。
6. 按 `Enter` 结束录音。
7. 程序会把结果写入剪贴板，并尝试粘贴到之前光标所在位置。

默认快捷键是 `Ctrl+Alt+M`。设置自定义快捷键后，程序应只注册新的快捷键。

## 转写模式

`Stable` 是默认模式，会调用 MiMo 两次：

1. 音频转原始文本
2. 对纯文本做填充词删除、重复片段合并和标点修正

`Fast` 只调用一次 MiMo，延迟更低，但在音频含糊或模型不稳定时，更容易出现解释、总结、提示词片段等非转写内容。

## 当前缺点

- 这还不是真正的 Windows IME，只是全局语音输入助手。它依赖剪贴板和粘贴动作，部分软件可能拦截、延迟或拒绝粘贴。
- MiMo 多模态聊天接口不是专用 ASR 接口，所以仍可能偶发输出解释、总结、标签、提示词片段，或者遗漏标点。
- Stable 模式为了稳定性会调用两次 API，因此延迟和费用都会比单次调用更高。
- 如果第一次音频转写已经听错，第二次文本清理只能整理已有文本，不能恢复没有听准的内容。
- 焦点恢复和自动粘贴受目标应用、管理员权限窗口、远程桌面、浏览器输入策略和 Windows 安全策略影响，不保证所有场景都成功。
- 音频会上传到用户配置的 API 地址。程序默认不读取屏幕、不自动上传剪贴板，但隐私仍取决于所用服务商、账号和 Base URL。
- 麦克风选择依赖 Windows 设备名和 Electron 音频采集行为，某些设备可能需要手动选择或重启程序后才稳定。
- 口头词和重复词清理仍有启发式规则，可能漏删“呃、嗯、就是”等填充词，也可能误删用户本来想保留的重复表达。
- 目前没有安装包、自动更新、代码签名和正式发布流程。运行项目仍需要 Node.js、npm 和 Electron 依赖。
- 日志只保存在本地，但可能包含运行状态、接口错误和部分调试信息；公开 issue 前应先检查日志内容。

## 隐私

程序只上传本次录音到配置的 MiMo 兼容 API 地址。它不会读取整屏内容，也不会自动上传剪贴板内容。设置里的短上下文只有在用户主动填写时才会发送。

如果在设置中保存 API Key，Key 会存放在 Electron 用户数据目录。公开仓库、演示或交给他人使用时，建议使用环境变量或本地 `.env`，不要把真实 Key 提交到 Git。

## 开发

运行检查：

```powershell
npm run check
npm run test:clean
node --check src\main.js
node --check src\preload.js
node --check src\renderer\renderer.js
```

运行日志路径：

```text
%APPDATA%\mimo-voice-input\mimo.log
```


## 许可证

MIT
