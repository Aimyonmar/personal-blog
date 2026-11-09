---
title: 手机在向谁上报：一次免 root 的预装组件流量核查
summary: 用系统自带的流量统计锁定一个 UID，用 adb 确认它是特权预装应用，再用免 root 抓包拿到真实报文。这篇记录的是取证链路本身：怎么发现、怎么验证、哪些能证、哪些只能算现象。
tags: [Android, 抓包分析, 隐私, 逆向]
published_at: 2026-11-09
updated_at: 2026-11-09
---

## 起因：一个方向比异常的 UID

在一台 Redmi 上翻系统流量记录时，注意到一个包的收发比例很反常：发送量是接收量的 5 倍多。日常应用（浏览器、视频、购物）几乎都是接收远大于发送，单向上报才长这样。

沿着这条线索查下去，得到一个可以复现的观察：`com.mobiletools.systemhelper` 会向 `http://dm.wo.com.cn:18080/registerv3` 发起一次约 84 KB 的上传，服务端返回一张 24 小时有效的会话票据。整个过程不需要用户授权。

下面是完整链路。全程没有 root、没有刷机、没有解锁 BootLoader。

## 环境与工具

| 项 | 内容 |
|---|---|
| 设备 | 一台 Redmi 机型（型号隐去） |
| 系统 | Android 13（MIUI / HyperOS） |
| 电脑 | Windows，platform-tools 37.x |
| 抓包 | PCAPdroid v2.0.2（开源，本地 VPN 方式，免 root） |
| 分析 | 字节扫描 + `adb dumpsys` + APK 静态字符串提取 |

## 第一步：用 netstats 按 UID 排序

`netstats` 是系统网络统计，按 UID 汇总每个应用的历史收发量，不需要 root：

```bash
adb shell dumpsys netstats detail > netstats.txt
adb shell pm list packages -U > pkg_uid.txt   # 包名与 UID 映射
```

把 `tb`（发送字节）字段按 UID 聚合排序，再和包名映射表对照，就得到候选名单。这次排在前面的几个系统组件是：

| UID | 包名 | 发送 | 接收 |
|---|---|---|---|
| 10129 | com.miui.analytics | 3,825,051 | 3,949,834 |
| 10150 | com.miui.systemAdSolution | 2,634,540 | 24,306,204 |
| 10153 | com.xiaomi.metoknlp | 680,881 | 1,740,220 |
| **10084** | **com.mobiletools.systemhelper** | **1,687,064** | **317,035** |

`systemhelper` 是唯一一个发送量超过接收量的。这个判据不依赖任何私有信息，只看方向比。

有一个容易踩的坑：`dumpsys netstats` 的桶大小是 2 小时（`bucketDuration=7200`），直接把数字除以次数会严重低估单次上传体积，看起来只有几 KB。真实值必须靠抓包测。

## 第二步：确认它是什么

```bash
adb shell dumpsys package com.mobiletools.systemhelper
```

关键输出：

```
codePath=/system/priv-app/SystemHelper
versionName=1.2-20230111
userId=10084
pkgFlags=[ SYSTEM HAS_CODE ALLOW_CLEAR_USER_DATA ]
privateFlags=[ ... PRIVILEGED ... ]
targetSdk=33
```

`priv-app` 意味着两件事：权限在出厂时就已授予，普通应用的权限界面管不到它；文件在系统分区，无法直接删除。

它已获得的权限里，和"上报"这件事直接相关的有：

| 权限 | 能力 |
|---|---|
| `INTERNET` | 联网 |
| `READ_PHONE_STATE` / `READ_PRIVILEGED_PHONE_STATE` | 读设备标识、SIM 与运营商、基站信息 |
| `QUERY_ALL_PACKAGES` | 枚举本机已安装应用 |
| `PACKAGE_USAGE_STATS` | 读取各应用使用记录 |
| `ACCESS_FINE_LOCATION` / `ACCESS_BACKGROUND_LOCATION` | 定位，且允许后台定位 |
| `READ_EXTERNAL_STORAGE` | 读外部存储 |
| `SCHEDULE_EXACT_ALARM` / `RECEIVE_BOOT_COMPLETED` | 精确闹钟唤醒、开机自启 |

注册的入口有四个，其中三个是开机、网络变化、SIM 状态变化的广播接收器，第四个是一个可以跨进程调用的 AIDL 服务。定时任务是这样：

```
*walarm*:com.mobiletools.systemhelper/.control.ScheduleRegisterReceiver
  type=ELAPSED_WAKEUP  exactAllowReason=permission
  下次触发：+1h33m41s
```

`exactAllowReason=permission` 说明它用的是精确闹钟，不受 Doze 延迟——普通应用申请不到这个待遇。

## 第三步：静态分析找端点

APK 在系统分区可以直接拉，无需 root：

```bash
adb shell pm path com.mobiletools.systemhelper
adb pull /system/priv-app/SystemHelper/SystemHelper.apk
```

这里有个细节：直接对 APK 做字节扫描是扫不到字符串的，因为 `classes.dex` 在 zip 里是压缩的，必须先解压再扫。

解压后从 dex 里提取到两个地址：

```
http://dm.wo.com.cn:18080/registerv3
http://dm.wo.com.cn:18080/public/ip
```

以及几段可读的字符串：

```
isUnicomNetwork=false, not post!
enter getCurDeviceInfo--RegType:
enter====>LOCATION
assets/pub.cer
```

`isUnicomNetwork=false, not post!` 说明代码里存在"只在联通网络下上报"的分支判断。但实测在不使用联通蜂窝网络时仍然抓到了流量，说明这个判断存在没有被覆盖的路径。这是现象，不是对触发条件的完整结论——触发条件还需要更长的观测才能确定。

`assets/pub.cer` 是一个 596 字节的证书文件。结合上报字段中的 RSA/AES 相关实现，可以判断载荷是加密的。

从 dex 里能提取到的疑似字段名：

```
imei  imsi  iccid1  iccid2  cellid  pkgName  firstPowerOn  file_id
```

注意措辞：这些是**代码里出现的字符串**，不等于实际发送了这些值。载荷没有解开，这一点后面还会说。

## 第四步：抓包拿真实报文

静态分析只能说明"它可能采什么"，抓包才能确认"它实际发了什么、发到哪、多久一次"。

本次用 PCAPdroid，它基于 `VpnService`，免 root、不用接线，能看到明文 HTTP 头。代价是抓包期间占用 VPN，其他代理类应用不可用。同类方案还有"手机连电脑热点 + Wireshark"（不受 VPN 限制，但抓不到蜂窝流量）和 root 后的 on-device tcpdump（覆盖最全，代价是解锁 BL 会清空数据）。

PCAPdroid 建立会话后，VPN 信息里可以看到它覆盖全部 UID：

```
VpnTransportInfo{type=1, sessionId=PCAPdroid VPN}
Transports: VPN
Uids: <{0-99999}>
```

### 触发上报的关键坑

停用再启用之后，包会处于 `stopped=true` 状态。Android 的规则是：处于 stopped 状态的包收不到静态注册的广播。所以这时候切 WiFi、插拔 SIM 都不会触发它，看起来像"它没动静"。必须先唤醒一次：

```bash
adb shell am start -n com.mobiletools.systemhelper/.Activity.TestActivity
```

进程出现在 `ps -A` 里之后，抓包立刻命中。

另外，`CONNECTIVITY_CHANGE`、`SIM_STATE_CHANGED` 属于受保护广播，用 `am broadcast` 伪造会被系统直接拒绝：

```
java.lang.SecurityException: Permission Denial: not allowed to send broadcast
```

### 抓到的请求

```
POST /registerv3?ver=3.0&model=<机型>&manuf=Xiaomi&sign=<签名> HTTP/1.1
Content-Type: application/encrypted-json
Content-Length: 86160
User-Agent: Dalvik/2.1.0 (Linux; U; Android 13; <机型> Build/<版本号>)
Host: dm.wo.com.cn:18080
Connection: Keep-Alive
Accept-Encoding: gzip
```

三个可以直接下结论的点：

1. 传输层是明文 HTTP，端口 18080，没有 TLS。URL 里的机型、厂商、签名，链路上任何一个节点都能看到。
2. 载荷是加密的。`application/encrypted-json`，86160 字节，约 84 KB。抓到包也看不到里面的 JSON，只能用 `pub.cer` 那套密钥去解。
3. 单次 84 KB，不是流量统计里那个 2 KB 的量级。

### 抓到的响应

```
HTTP/1.1 200 OK
Server: titan-gslb
Content-Type: application/octet-stream
Content-Length: 246
Session-Ticket: <会话票据>
Session-Valid: 86400
Connection: close
```

`Session-Valid: 86400` 是 24 小时。这张票据的用途很清楚：注册一次，拿一张一天有效的凭证，到期前再续。至于实际续期节奏是不是严格一天一次，我没有做跨天的连续统计，只能说抓包期间的观测与 24 小时有效期一致。

服务端的归属：域名 `wo.com.cn` 属于中国联通，解析落在一张 GSLB 节点上，出口归属联通江苏。这是域名归属信息，不涉及具体设备。

## 顺带查出来的其他组件

同一套 UID 排序还暴露了三个上传量更大的系统组件：`com.miui.analytics`（小米统计，预装在 `/product/app/AnalyticsCore`）、`com.miui.systemAdSolution`（广告服务）、`com.xiaomi.metoknlp`（网络定位）。它们都是系统预装，属于另一条线，这里只记结论不展开。

另外澄清一个常见误解：`com.miui.guardprovider` 的流量是 **0**。它是一个 ContentProvider，本身不联网，只给安全中心提供病毒库查询能力，把它当成"后台传数据"的对象是搞错了。

真正持有录音、读取通话记录与短信权限的是 `com.miui.securitycenter`（手机管家）。它运行在 uid 1000，与其他系统应用共享 UID，`netstats` 上完全混在一起，无法单独统计，只能靠抓包和权限清单间接判断。

## 处置与回滚

停用联通侧的那个组件：

```bash
adb shell pm disable-user --user 0 com.mobiletools.systemhelper
```

返回 `new state: disabled-user`、`enabled=3`，即 `COMPONENT_ENABLED_STATE_DISABLED_USER`——只对当前用户停用，系统分区文件不动，可逆。

验证：

```bash
adb shell ps -A | grep systemhelper        # 无进程
adb shell dumpsys alarm | grep systemhelper # 无定时任务
```

卸载小米统计则先备份再卸：

```bash
adb shell pm path com.miui.analytics
adb pull /data/app/.../base.apk ./backup.apk
adb shell dumpsys package com.miui.analytics > ./state_before.txt

adb shell pm uninstall -k --user 0 com.miui.analytics
```

`-k` 保留数据目录，系统分区里的原始 APK 不受影响。

会不会变砖：不会。`pm uninstall --user 0` 和 `pm disable-user` 都不触碰系统分区。`com.miui.analytics` 的原始 APK 仍在 `/product/app/AnalyticsCore/AnalyticsCore.apk`，随时可以恢复：

```bash
adb shell cmd package install-existing --user 0 com.miui.analytics
```

| 操作 | 可能影响 | 恢复命令 |
|---|---|---|
| 停用 `systemhelper` | 联通侧的业务下发（APN 更新、定制应用安装、业务开通推送）可能失效 | `pm enable com.mobiletools.systemhelper` |
| 卸载 `miui.analytics` | 云服务、主题、应用商店的推荐逻辑可能降级，可能出现"已停止运行"弹窗 | `pm install-existing --user 0 com.miui.analytics` |

两者都不影响通话、短信、VoLTE 和 5G 数据，这些能力由 modem 和 `com.android.carrierconfig` 负责。实测停用后两张卡均保持 `IN_SERVICE`。

关于 OTA：`pm disable-user` 的停用状态通常能保留，但大版本升级可能重置；`pm uninstall --user 0` 的卸载状态在 OTA 后不会自动恢复。无论哪种，升级完都建议复查一遍。

## 这次核查查不清的部分

写这篇文章时，我把"能证"和"只是现象"分得比较开，因为界限确实存在：

- **载荷没解开。** 84 KB 的 `application/encrypted-json` 只确认了目标、体积、频率和响应格式。字段名来自 dex 字符串，无法证明对应字段的实际取值。要坐实得逆向 `pub.cer` 的加解密流程。
- **VPN 方案有盲区。** PCAPdroid 基于 `VpnService`，绕过 VPN 的流量（`bindProcessToNetwork`、native daemon）抓不到。本次 `systemhelper` 的流量正常经过隧道，但不保证所有系统组件都如此。
- **uid 1000 的组件统计不到。** 手机管家、系统框架这类共享 UID 的应用在 `netstats` 上混在一起，只能靠抓包和权限清单间接判断。
- **动机不可证。** 用途可以是运营商业务开通、设备管理、防诈，也可能是别的。代码只能说明行为，说明不了目的。

## 想自己复现的话

```bash
# 1. 环境
adb version                    # 需要 1.0.41 以上，老版本连不上 Android 11+

# 2. 找嫌疑组件
adb shell pm list packages | grep -Ei "carrier|unicom|helper|operator"
adb shell pm list packages -U   # 拿 UID 映射
adb shell dumpsys netstats detail

# 3. 看它要什么权限
adb shell dumpsys package <包名> | grep "granted=true"

# 4. 看它什么时候动
adb shell dumpsys alarm | grep <包名>

# 5. 拉 APK 静态分析（记得先解压 classes.dex）
adb pull <codePath>/base.apk

# 6. 抓包验证（PCAPdroid 或电脑热点）
# 7. 处置 + 复测
adb shell pm disable-user --user 0 <包名>
```

三个实际操作中会卡住的点：

1. 部分开发工具自带老版本 `adb`（例如 1.0.39），对 Android 11+ 基本不可用，需要单独装官方 platform-tools。
2. MIUI 默认拦截 `adb install`（`INSTALL_FAILED_USER_RESTRICTED`），也拦截 `adb shell input tap`。要远程装应用得开「USB 调试（安全设置）」。
3. 电脑上跑虚拟机时，虚拟机可能抢占手机的 USB 设备，表现为 adb 时断时续，需要在虚拟机的可移动设备设置里断开或改成询问模式。

## 写在最后

这次核查值得记下来的不是"某厂商在收集数据"——这个判断本身没什么信息量。值得记的是**取证链路对普通人是可复现的**：不 root、不刷机，一台电脑加几个开源工具，就能把一个预装组件的行为还原到"发到哪个地址、多久一次、包多大、服务器回了什么"这个粒度。

至于这些数据被用来做什么、谁能访问、保存多久，不在抓包能回答的范围内。

文中的原始抓包只留在本地，没有公开。文中涉及的设备型号、签名和票据均已隐去。
