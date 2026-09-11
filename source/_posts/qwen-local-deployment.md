---
title: 在自己电脑上跑千问 Qwen：llama.cpp 本地部署实操
date: 2026-09-11 16:00:00
categories:
  - 大模型
tags:
  - Qwen
  - llama.cpp
  - 本地部署
  - GGUF
  - 量化
  - 开源模型
description: 从显存选型到量化档位：下载 GGUF 模型、解压 llama.cpp、写一个带菜单的启动脚本、放好 CUDA DLL，最后在本机 8080 端口跑起一个 35B 的 MoE 模型。附脚本参数逐项说明和低比特量化的短板提醒。
cover: /img/cover_qwen-local-deployment.jpg
---

前段时间我想在本机上跑个模型。

动机挺朴素的：在线服务按 token 计费，有些活儿需要反复试错（比如反复调一段提示词），跑在自己机器上心里更有底，而且断网照样能用。

我机器显存不算大，一开始以为 30B 级别的模型跟我没关系。后来才知道，用 llama.cpp 加载 GGUF 格式的量化模型，把权重压到 4bit，35B 的 MoE 模型也能在十几 G 显存上跑起来，速度还凑合。

这篇把整条路记下来：怎么按显存挑模型文件、llama.cpp 怎么装、启动脚本怎么写、CUDA 配置放哪儿。截图都是我操作时随手截的，配图和文件名都对应得上。

## 一、先说清楚：我跑的是个什么模型

我用的是社区微调版，模型全名是 **Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive**，发布在 HuggingFace 上。名字里的 `A3B` 是 MoE（混合专家）架构的意思——总参数 35B，每次推理只激活其中一小部分，所以显存占用和速度都比同规模的稠密模型友好。

名字里那个 `Uncensored`，就是社区俗称的"越狱版"。它和官方 Qwen 的区别，说白了就一件事：

| 对比项 | 官方版 | 社区 Uncensored 微调版 |
|---|---|---|
| 安全对齐 | 有，敏感问题会拒答 | 大幅削弱甚至移除 |
| 拒答行为 | 常见 | 基本没有 |
| 稳定性 / 维护 | 官方评测、长期更新 | 看发布者个人，可能不再维护 |
| 适合的用途 | 生产环境、对外服务 | 本地自用、实验 |

**为什么有人要这个版本？** 官方模型出于安全考虑加了很多限制，有时候你只是正常提问，它也会回一句"抱歉，我无法帮助你"。这类微调版就是把这种拦路的概率降到很低，好处是实验时不容易被打断。

但这件事的另一面也得说清楚：**它移除了安全对齐，也就等于不再替你做判断。** 什么该问、什么不该问，责任全在使用者这边。我的用法很窄——本地跑着做提示词实验、看它的推理过程；不会拿它的输出直接对外发布，更不会用它生成违法或者伤害他人的内容。本地部署的意义是"可控"，不是"没约束"，这两码事。

模型页面在这里，需要的话自行核对许可证和文件列表：

```text
https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive
```

## 二、按显存挑文件：别一上来就下最大的

HuggingFace 页面上同一个模型会挂好几个文件，区别在**量化精度**。精度越低，文件越小、越省显存，但模型的"脑子"也会跟着松一点。

这是 llama.cpp 常用的几档，先有个概念：

| 量化档位 | 大致含义 | 特点 |
|---|---|---|
| `Q4_K_M` | 4bit，K-quant 中等档 | 质量和体积平衡，最通用的选择 |
| `Q4_K_P` | 4bit，较新的变体 | 质量略好一点，大显存卡推荐 |
| `IQ4_NL` | 4bit，i-quant 系列 | 压缩比更高，质量损失可控 |
| `IQ2_M` | 2bit，极致压缩 | 体积最小，精度损失明显 |

选哪个，看你的显存：

**6G / 8G 显存**——直接下 IQ2_M 那档，实在想稳一点，下 15G 左右的也可以：

![HuggingFace 文件列表：6G/8G 显存建议下载的量化档位](/img/qwen-vram-01-8g.png)

**16G 显存**——可以往上走一档，选 Q4 系列：

![HuggingFace 文件列表：16G 显存建议下载的量化档位](/img/qwen-vram-02-16g.png)

**更高显存（比如 24G 的 4090）**——页面上最上面那个 44GB 的文件可以试试，那是压缩程度最低、质量最好的一档：

![HuggingFace 文件列表：大显存可选的最上层大文件](/img/qwen-vram-03-44g.png)

**另外，如果想要识别图片的功能（多模态）**，还要额外下一个 `mmproj` 视觉投影文件：

![HuggingFace 文件列表：多模态需要的 mmproj 视觉投影文件](/img/qwen-vision-model.png)

> **下载提示**：别用浏览器内置下载，大文件容易断且没有断点续传。用专门的下载工具或者命令行更靠谱，网络条件好的话速度会快很多。

## 三、把 llama.cpp 拉下来

推理引擎我用的是 **llama.cpp**，一个 C/C++ 写的项目，纯靠 CPU 也能跑，显卡方面 N 卡、A 卡、I 卡都支持，Mac 和 Linux 一样能用：

![llama.cpp 项目主页：支持多种显卡与纯 CPU 运行](/img/qwen-llamacpp-01-hardware.png)

```text
https://github.com/ggml-org/llama.cpp
```

打开仓库，往下拉到 Release 区域，找 **Windows 端的预编译包**：

![GitHub Release 页面：Windows 预编译包的位置](/img/qwen-llamacpp-02-windows.png)

你机器是什么显卡，就下对应版本的包（CUDA 版 / Vulkan 版 / CPU 版）。解压之后就是全部了，不用编译。

## 四、写一个一键启动脚本

每次启动都敲一长串参数太累，写个 bat 脚本，双击就能选档位。

在 llama.cpp 根目录下新建一个 txt，把内容粘进去，然后把后缀改成 `.bat`。**保存时编码记得选 ANSI**，否则脚本里的中文提示会显示成乱码：

```bat
@echo off
setlocal
chcp 65001 >nul
title Qwen3.6-35B-A3B Uncensored

cd /d "%~dp0"

rem ====== 要改配置，动这三行就行 ======
set "MODEL=Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive"
set "MMPROJ=models\mmproj-%MODEL%-f16.gguf"
set "PORT=8080"

rem 视觉模型存在才挂载，没下载就自动跳过
set "MMARG="
if exist "%MMPROJ%" set MMARG=--mmproj "%MMPROJ%"

if not exist "llama-server.exe" (
    echo [错误] 当前目录找不到 llama-server.exe
    echo 请把本脚本放到 llama.cpp 解压后的根目录再运行。
    pause
    exit /b 1
)

:menu
set "QUANT="
set "CTX="
set "NCMOE="
cls
echo ==========================================
echo      Qwen3.6-35B-A3B Uncensored + 多模态
echo ==========================================
echo.
echo 1. Q4_K_P   大显存推荐（4090）
echo 2. Q4_K_M   稳定版
echo 3. IQ4_NL   高压缩高质量
echo 4. IQ2_M    6G / 8G 显卡
echo 5. IQ2_M + CPU 分担（显存不够、内存够）
echo 0. 退出
echo.
echo ==========================================

set "choice="
set /p "choice=请输入数字："

if "%choice%"=="0" exit /b 0

rem 上下文长度直接决定 KV cache 预分配的显存，显存不够就往下调
if "%choice%"=="1" (
    set "QUANT=Q4_K_P"
    set "CTX=131072"
)
if "%choice%"=="2" (
    set "QUANT=Q4_K_M"
    set "CTX=131072"
)
if "%choice%"=="3" (
    set "QUANT=IQ4_NL"
    set "CTX=131072"
)
if "%choice%"=="4" (
    set "QUANT=IQ2_M"
    set "CTX=8192"
)
if "%choice%"=="5" (
    set "QUANT=IQ2_M"
    set "CTX=32768"
    set "NCMOE=--n-cpu-moe 26"
)

if not defined QUANT (
    echo.
    echo [提示] 只能输 0-5，请重新选。
    timeout /t 2 >nul
    goto menu
)

set "GGUF=models\%MODEL%-%QUANT%.gguf"
if not exist "%GGUF%" (
    echo.
    echo [错误] 没找到模型文件：
    echo    %GGUF%
    echo 请确认该档位已下载，并放在 models 文件夹里。
    pause
    goto menu
)

echo.
echo 正在启动：%QUANT%   上下文 %CTX%
echo 首次加载要点时间，请耐心等……
echo.

llama-server.exe ^
    -m "%GGUF%" ^
    %MMARG% ^
    -ngl 999 ^
    -fa on ^
    -c %CTX% ^
    -n 8192 ^
    %NCMOE% ^
    --host 127.0.0.1 ^
    --port %PORT%

echo.
echo [服务已退出] 按任意键回到菜单。
pause >nul
goto menu
```

脚本里有两个细节值得单独说：`pause` 放在哪、以及哪些参数是真正需要理解的。

`pause` 的位置在 `llama-server` 之后、`goto menu` 之前——服务正常退出（Ctrl+C）或者崩了的时候，窗口不会一闪而过，报错信息能留住。最后回到菜单，可以换个档位再试，不用重新双击。

参数逐个说明：

| 参数 | 作用 | 说明 |
|---|---|---|
| `-m` | 指定模型文件 | 路径要对上 `models\` 里的实际文件名 |
| `--mmproj` | 指定视觉投影文件 | 脚本已做存在性判断，没下载就自动跳过 |
| `-ngl 999` | 模型层丢给 GPU 的数量 | 新版默认就是 `auto`，写 999 是为了兼容旧版 |
| `-c` | **上下文长度（预分配）** | `131072` = 128K，会按这个值预留 KV cache |
| `-n` | 单次生成上限 | 一次最多输出多少 token |
| `-fa on` | 开启 Flash Attention | 长上下文下提速 |
| `--n-cpu-moe 26` | 前 26 层专家交给 CPU | 只出现在第 5 档 |
| `--host` / `--port` | 监听地址与端口 | 两者默认值就是 `127.0.0.1:8080` |

> **`-c` 是这套参数里最容易踩的坑。** 它写的不是"上限"，而是**预分配**——填 131072，llama.cpp 就会按 128K 上下文去准备 KV cache（默认 f16 精度）。这笔开销通常在几 GB 到十几 GB，16G 显存配 4bit 模型基本撑不住。所以第 4 档压到了 `8192`。如果你选 4bit 档也起不来，第一个要动的就是它，往下调到 `32768` 试试。

**第 5 档是给"显存刚好卡住、但内存宽裕"的机器准备的**，它在 IQ2_M 基础上多挂了 `--n-cpu-moe 26`，把前 26 层的专家权重交给 CPU 算。

但**这招是双向的**：本身就一般的配置开完只会更慢，因为 CPU 推理比 GPU 慢一个数量级。只有"显存刚好卡住、内存和 CPU 都比较宽裕"才值得试。

## 五、正式部署：五步走

前面三样东西（模型、llama.cpp、启动脚本）准备好之后，按顺序来：

**（1）建 `models` 文件夹。** 把 llama.cpp 压缩包解压，进根目录，新建一个文件夹命名为 `models`：

![llama.cpp 根目录下新建 models 文件夹](/img/qwen-setup-01-models-folder.png)

**（2）把模型塞进去。** 下载好的主模型和 `mmproj` 视觉文件，都放进 `models` 文件夹：

![models 文件夹中放入模型文件与视觉投影文件](/img/qwen-setup-02-put-models.png)

**（3）补上 CUDA 运行库。** 回到根目录，把对应版本的 CUDA DLLs 压缩包（12.4 或 13.3，按你的驱动和显卡版本选）解压到根目录下。**这一步不做，程序就识别不到 GPU**，只能纯 CPU 慢慢跑：

![将 CUDA DLLs 解压到 llama.cpp 根目录](/img/qwen-setup-03-cuda-dlls.png)

**（4）双击 bat 启动。** 输入对应的数字，回车：

![双击 bat 脚本并选择量化档位](/img/qwen-setup-04-launch.png)

首次运行会慢一些，模型加载和显存分配都要时间，耐心等一下。

**（5）浏览器打开界面。** 服务地址是 `http://127.0.0.1:8080`，复制到浏览器即可：

![浏览器访问 127.0.0.1:8080](/img/qwen-setup-05-open-url.png)

看到对话界面，就算跑起来了：

![llama.cpp 自带的 WebUI 对话界面](/img/qwen-setup-06-webui.png)

默认端口 `8080` 是 llama.cpp 自带的 WebUI，够直接开聊。另外它同时也是个 OpenAI 兼容的 API 端点，像 Hermes、Openclaw 这类客户端可以直接把接口地址指过来，不用额外搭服务。

## 六、它能干什么，短板又在哪

跑起来不等于好用。用了一段时间，说几个实际感受。

**先说最要紧的短板：低比特量化的代价。**

如果你选的是 `IQ2_M`（2bit 极致压缩，一开始那个十几 G 的文件），模型内部参数的精度损失是比较大的。表现就是——**做复杂多步计算题容易迟钝甚至算错**。比如给一串约束条件让你算内存占用、或者推导一个多阶段的执行计划，它可能在中间某一步就滑掉了。

这不是模型笨，是 2bit 压得太狠。遇到这类题，别指望它一步给结果，让它**分步写公式**，把中间过程摊开，准确率会明显回升。

**两个实用技巧：**

**1. 在 Prompt 里要求它先想再答。** 别只问"答案是什么"，加一句：

> "请先分析每个选项的对错原因，最后再给出正确答案。"

35B 的底子是够的，让它自己"自言自语"一遍，很多时候能自我纠错。这就是常说的思维链（Chain of Thought）。

**2. 结合本地文档做 RAG。** 如果有配套的教材或手册 PDF，可以用本地嵌入模型搭一个检索。遇到它拿不准的细节，让它在文档里找依据，比凭记忆答要准得多。

**简单总结一下取舍：**

| 你在意的 | 该怎么做 |
|---|---|
| 显存紧张 | 选 2bit，接受精度损失 |
| 起不来 / 报显存不足 | 先把 `-c` 往下调，它是按值预分配的 |
| 答案要准 | 选 4bit 以上，分步提问 |
| 要识别图片 | 额外下载 `mmproj` 文件 |
| 要接第三方客户端 | 用 OpenAI 兼容的 8080 端点 |
| 速度太慢 | 先确认 CUDA DLL 放对了，再试第 5 档的 CPU 分担 |

## 写在最后

本地部署这件事，最反直觉的地方在于：**跑起来只要一下午，跑得好要调很久。**

第一次启动成功的时候确实挺爽——一个 35B 的模型，安安静静地在自己机器上转，不问网络要一个 token。但接下来你会发现，量化档位要试、上下文长度和显存要权衡、提问方式也影响结果。它不是装完就完事的软件，更像一台需要磨合的机器。

另外，前面第一节提到的那个边界，我还是想再放一遍：**这类移除了安全对齐的模型，等于把判断权交回给了使用者。** 本地跑，自己负责。技术上的"能跑"和用途上的"该不该"，是两件需要分开想的事。
