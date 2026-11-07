---
title: 1.5GB 下错了地方：把模型缓存从环境变量手里拿回来
summary: 模型被下到旧项目的目录，程序却按项目内目录判断有没有缓存，于是每次启动都像第一次。查下来是用户级缓存环境变量残留，加上三处 setdefault 从不纠正继承值。修法不是搬文件，而是让项目脚本在进程启动前显式覆盖它。
tags: [工程实践, 复盘, Python, 环境配置]
published_at: 2026-11-08
updated_at: 2026-11-08
series: Translator 改进记录
series_order: 1
---

## 起因：模型又被"首次启动"了一次

启动时模型被下到 `D:\tencent\workbuddy-workplace\settings\hf\hub`。那是一个已放弃项目的遗留路径，程序本体却在项目内 `.runtime\hf` 找缓存。结果就是：判定首次启动、重新下载、1.5GB 白下。

控制台当时打印的是「检测到系统已设 HF_HOME，模型与该目录共用，不会重复占用空间」。这句话在"共用"成立时是对的，但程序根本没有去那个目录找。

## 先确认是谁写的 HF_HOME

| 作用域 | HF_HOME |
| --- | --- |
| 用户环境变量（HKCU\Environment） | `D:\tencent\workbuddy-workplace\settings\hf` |
| 系统环境变量（Machine） | 空 |
| `HF_HUB_CACHE` | 未设 |

不是两个启动脚本设的，也不是 `准备模型.py` 设的——它们只是从父进程继承了它。真正写它的是用户级环境变量，来源是那个已经放弃的旧项目。

继承链条很清楚：用户环境变量 → 启动 bat（cmd）→ python.exe → `准备模型.py` 或 `main.py`。Python 里再赋值，只影响当前进程和它之后启动的子进程，改不到已经存在的父 shell。所以"在代码里设一下"从一开始就管不到最外层。

## 根因：setdefault 只会沿用，不会纠正

旧代码三处都这么写：

```python
os.environ.setdefault("HF_HOME", _RUNTIME_HF)
```

进程里已有值，`setdefault` 就什么都不做。于是项目内缓存目录从来没生效过，模型照旧下到外部路径，下次启动再按项目目录判定"没缓存"。

还有一个更隐蔽的分叉。`core/model_store.py` 的 `cache_root()` 当时是 `os.environ.get("HF_HOME") or ~/.cache/huggingface`。只有 `asr` 先被导入时，它才碰巧和加载逻辑一致；独立跑 `准备模型.py --check` 时，面板上的「已下载 / 占用」会和 asr 实际加载的目录对不上。

记录里这不是第一次，重建环境时踩过同一个坑。同一个问题第二次出现，说明上次只修了现场，没有改掉"谁说了算"。

## 顺带排除的另一条线：为什么下的是 kotoba

排查时还有一个看起来可疑的点：项目默认模型是 `small`，实际下载的却是 `kotoba-whisper-v2.0`。翻代码后确认，`core/config.py` 里默认值仍是 `small`，`config.json` 里保存的是 kotoba；面板下拉框改动会直接写盘。也就是说，这是使用者在界面里选的日语档，不是代码改了默认值。

把行为分成配置、代码、环境三层之后，这条线很快就能排除。真正的问题仍然在环境层。

## 方案：把覆盖放到最外层

原则一句话：项目内脚本覆盖外部变量，而不是依赖外部变量。反过来依赖外部变量，等于让一个已经放弃的项目继续决定当前项目的缓存位置。

| 位置 | 改动 |
| --- | --- |
| `core/asr.py` | `setdefault` 改为直接赋值 |
| `core/model_store.py` | `cache_root()` 固定返回项目目录；`download()` 直接赋值 |
| `准备模型.py` | 直接赋值，提示改为「已忽略环境里的 HF_HOME=…」 |
| `启动翻译器.bat` | 在任何 python 调用前设置 |
| `调试模式启动.bat` | 同上 |

前面两个文件在 Python 里改，后面两个必须写在 bat 里：

```bat
set "HF_HOME=%~dp0.runtime\hf"
```

原因是 bat 的 `set` 只影响当前 `cmd` 进程和它启动的子进程，Python 里的赋值改不了父 shell。要让「准备模型.py → main.py」两条路径看到同一份缓存，只能由最外层的 bat 先定死。这样 `--check`、下载、真实加载才指向同一个目录。

改 bat 时还做了一次字节级复核。Windows 批处理被编辑器改成 UTF-8 或混入裸 LF 后，中文注释会乱码，命令也可能被截断：

| 文件 | 字节 | CRLF | 孤立 LF | BOM | GBK 解码 |
| --- | --- | --- | --- | --- | --- |
| `启动翻译器.bat` | 2514 | 78 | 0 | 无 | 正常 |
| `调试模式启动.bat` | 479 | 19 | 0 | 无 | 正常 |

这些数字不产生功能，但它们能证明"文件没被编辑器悄悄改坏"。

## 验证：在带污染的环境里跑

改完不能只在干净环境里测，否则等于没测。验证时先手动把旧值灌回去：

```text
env HF_HOME=D:\tencent\workbuddy-workplace\settings\hf

准备模型.py --check
→ D:\my-project\Translator\.runtime\hf\hub\models--kotoba-tech--...
→ exit=0

import core.asr 之前 HF_HOME=旧目录；之后 = 项目 .runtime\hf
model_store.cache_root() = 项目 .runtime\hf
model_store.is_downloaded('kotoba-whisper-v2.0') = True
```

最后用 CPU/int8 真实加载一次，6.5 秒成功。再把 `HF_HOME` 清空跑一遍 `--check`，仍指向项目内快照，exit=0。到这个点，才能说"缓存目录统一了"，而不是"代码看起来改了"。

## 那 1.4GB 旧缓存：先比对，不搬

旧目录总计 1446.3MB，只有 kotoba 一个仓库。项目内也有一份，先看是不是重复：

- 两边 `model.bin` 都是 1512927867 字节；
- SHA256 同为 `60D2BC2E33DE9D43F2745BE09CAEFE1161ACAB670F6796D4A750D8D848382B36`；
- 项目内快照 5 个文件齐全：`model.bin`、`config.json`、`tokenizer.json`、`preprocessor_config.json`、`vocabulary.json`，加载必需的三个都在；
- 旧目录多出的 `README.md` 和 `.gitattributes` 只是仓库元数据，不影响加载。

结论是旧目录纯重复，不需要"移动到项目目录复用"。这一步很容易反过来做：先搬再查，搬完发现两边是同一份，白折腾一次，还可能把唯一完整的快照弄坏。先验证行为、再删数据，顺序反了就没有回退路径。

## 删除时遇到的"访问被拒绝"

确认重复后执行 `Remove-Item`，旧目录报「访问被拒绝」。但同一目录下可以正常建文件、删文件、重命名，说明不是权限，也不是占用。

最后改成先 `Rename-Item` 改名，再 `[IO.Directory]::Delete(path, true)`，一次删净。删除后 `hub` 下只剩空的 `.locks` 和 `CACHEDIR.TAG`。D 盘可用空间从 136.72 GB 变成 138.13 GB，多出 1.41 GB。回收站里 2.5GB 的旧 venv 没动，留给使用者自己清理。

## 这次刻意没做的事

用户环境变量 `HF_HOME` 保留着。代码和 bat 已经能覆盖它，删不删都不影响运行；但删除是不可逆的，等统一盘点后由使用这台机器的人确认。删除前还得先用新进程验证一次 `--check` 不再依赖它。

能改代码解决的事，不必顺手改别人的环境。这两件事的风险不在一个量级。

## 一条可复用的经验

当配置"看起来没生效"时，先查进程启动前谁写了这个变量，再查代码里是不是用了 `setdefault`。项目内的默认值应该覆盖外部变量，而不是给外部变量让路——默认值一旦让路，你看到的就是"有时候对、有时候不对"。

上一篇把发布权从平台手里拿回来，这一篇把缓存目录从环境变量手里拿回来。对象不同，问题一样：控制权在别处时，你只能看到结果，看不到它为什么这样。
