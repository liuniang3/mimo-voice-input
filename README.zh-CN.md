# Open Voice Input

一个支持可插拔 ASR 供应商和可选 LLM 文本清理的 Windows 语音输入助手。

Open Voice Input 目前是 Electron MVP，不是真正的 Windows 输入法驱动。它会录制语音，通过用户选择的 ASR 供应商转写文本，再按需调用文本模型清理口头词、重复片段和标点，最后写入剪贴板，并尝试粘贴到之前光标所在的应用里。

英文文档见：[README.md](README.md)

## 推荐配置

当前项目对小米 MiMo V2.5 的适配度最好。如果选择第一步语音后端，推荐优先使用 MiMo V2.5 作为 ASR 类多模态音频理解模型。项目也支持 Qwen3-ASR 和 Fun-ASR，但提示词、请求链路、Token Plan 处理和本地兜底清理规则目前围绕 MiMo V2.5 调得最充分。

第二步文字清洗不需要很大的模型。推荐使用 GPT-5.4 mini，或其他兼容 OpenAI 接口的小模型，用来删除口头词、合并重复片段并补充标点。

## 功能

- 全局快捷键录音
- 小型悬浮实时转写窗口
- 任务栏托盘菜单进入设置
- 可配置麦克风、快捷键、API Key、Base URL、供应商和模型
- ASR 供应商：MiMo 音频理解、Qwen3-ASR、Fun-ASR
- 文本清理供应商：MiMo 聊天清理、OpenAI 兼容接口清理
- `Fast` 模式：只做 ASR，延迟更低
- `Stable` 模式：先 ASR，再用 LLM 清理口头词、重复片段和标点
- 转写后写入剪贴板，并尝试粘贴到之前的焦点应用
- 本地兜底清理常见口头词、重复片段和提示词泄漏式输出

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

你可以在设置界面填写 Key，也可以使用环境变量：

```text
MIMO_API_KEY
MIMO_BASE_URL
DASHSCOPE_API_KEY
QWEN_ASR_API_KEY
FUN_ASR_API_KEY
CLEANER_API_KEY
CLEANER_BASE_URL
```

## 启动

无控制台窗口双击启动：

```text
Start Open Voice Input.vbs
```

带调试控制台双击启动：

```text
Start Open Voice Input.cmd
```

命令行启动：

```powershell
npm start
```

## 使用

1. 启动程序。
2. 右键任务栏托盘图标，打开 `设置`。
3. 设置 ASR 供应商、文本清理供应商、API 凭证、麦克风和全局快捷键。
4. 按全局快捷键呼出录音窗口。
5. 悬浮窗显示录音或实时转写时开始说话。
6. 按 `Enter` 结束录音。
7. 程序会把最终文本写入剪贴板，并尝试粘贴到之前光标所在位置。

默认全局快捷键：`Ctrl+Alt+M`。

## 供应商

ASR 供应商：

- `MiMo`：使用多模态音频理解能力。它不是专用 ASR 接口，但目前是本项目适配度最高的后端，推荐优先使用 MiMo V2.5 作为第一步 ASR 类模型。
- `Qwen3-ASR`：通过 DashScope/OpenAI 兼容配置接入专用 ASR，支持非实时和实时模式。
- `Fun-ASR`：通过 DashScope 接入专用 ASR。本地麦克风录音使用 WebSocket 实时协议；公网音频 URL 可走官方 REST 批处理。

文本清理供应商：

- `MiMo`：通过 MiMo 聊天模型清理文本。
- `OpenAI 兼容接口`：通过任意兼容聊天接口清理文本。第二步推荐使用 GPT-5.4 mini 或其他小模型。

## 转写模式

`Fast` 模式只执行 ASR。延迟更低，适合 ASR 模型本身已经足够干净的情况。

`Stable` 模式执行两步：

1. ASR 供应商返回原始转写文本。
2. 文本清理供应商删除口头词、合并重复片段并补标点。

每次录音都会使用录音开始时锁定的设置快照，因此录音处理中途修改设置只会影响下一次录音。

## 隐私

程序只上传本次录音和用户主动填写的短上下文到配置的供应商端点。它不会读取整屏内容，也不会自动上传剪贴板内容。

如果在设置中保存 API Key，Key 会存放在 Electron 用户数据目录。公开仓库、演示或交给他人使用时，建议使用环境变量或本地 `.env`，不要把真实 Key 提交到 Git。

运行日志路径：

```text
%APPDATA%\Open Voice Input\open-voice-input.log
```

## 当前缺点

- 这不是真正的 Windows IME，只是全局语音输入助手。它依赖剪贴板和粘贴动作，部分软件可能拦截、延迟或拒绝粘贴。
- 焦点恢复和自动粘贴受目标应用、管理员权限窗口、远程桌面、浏览器输入策略和 Windows 安全策略影响，不保证所有场景都成功。
- 实时 ASR 质量受麦克风、网络延迟、供应商行为和模型版本影响。
- 如果第一步 ASR 已经听错，第二步文本清理只能整理已有文本，不能恢复没有听准的内容。
- 口头词和重复词清理仍有启发式规则，可能漏删“呃、嗯、就是”等填充词，也可能误删用户本来想保留的重复表达。
- 目前没有安装包、自动更新、代码签名和正式发布流程。运行项目仍需要 Node.js、npm 和 Electron 依赖。

## 许可证

MIT
