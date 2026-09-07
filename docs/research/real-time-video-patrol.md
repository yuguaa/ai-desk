# 实时视频巡查开源项目调研

> 调研日期：2026-09-07
> 数据来源：GitHub Search API（star 数、license、最近更新时间均来自 API 实时查询）

## 一、结论速览

「实时视频巡查」在国内语境下对应**两条技术路线**，二者常组合使用：

1. **人工视频巡查 / 轮巡**：多路摄像头分屏「视频墙」+ 定时轮巡播放，值班人员盯屏巡查。
   技术底座是 **GB28181 国标平台** + 流媒体服务器。
2. **AI 智能视频巡查**：由 AI 自动轮巡摄像头画面，检测异常事件（未戴安全帽、明火、
   老鼠、入侵、抽烟等）并告警，减少人工盯屏。技术底座是 **AI NVR**（本地 YOLO/视觉模型）。

结论：**「视频巡查」没有单一同名旗舰项目，而是由「GB28181 平台 + AI NVR + 视频墙组件」
三类项目拼装而成。** 下面按类别列出可用的开源项目。

---

## 二、国标 GB28181 视频平台（国内视频巡查的事实标准底座）

国内摄像头（海康、大华、宇视等）几乎都走 GB28181 国标协议，这类平台负责接入、
拉流、分屏、云台控制、录像回放，是「视频巡查」最直接的底座。

| 项目 | Star | License | 说明 |
| --- | --- | --- | --- |
| [WVP-GB28181-pro](https://github.com/648540858/wvp-GB28181-pro) | 7.3k | MIT | 开箱即用的 GB28181-2016 网络视频平台，自带管理页面，支持海康/大华/宇视 IPC、NVR 接入，支持国标级联、分屏监控、云台控制、录像。国内该领域事实标准 |
| [ZLMediaKit](https://github.com/ZLMediaKit/ZLMediaKit) | 17.5k | MIT | 流媒体服务器内核，WebRTC/RTSP/RTMP/GB28181 全协议，常作为上述平台的媒体层 |
| [AKStream](https://github.com/chatop2020/AKStream) | 1.5k | MIT | 全平台流媒体管理控制接口平台，集成 GB28181/RTSP/RTMP，提供设备推拉流控制、PTZ 控制、录像管理 |
| [EasyDarwin](https://github.com/EasyDarwin/EasyDarwin) | 6.8k | - | 工业级 RTSP 流媒体服务器，青犀(TSINGSEE)系的开源内核 |
| [LiveGBS](https://github.com/livegbs/GB28181-Server) | 444 | - | GB28181 流媒体服务，**明确支持「多分屏轮巡播放」**、智能码流控制、云台控制、录像检索回放 |
| [GB28181.Solution](https://github.com/GB28181/GB28181.Solution) | 636 | - | GB28181 平台级联互联方案，Linux/Win/Docker/K8s |

> 注：GB28181 平台普遍自带「分屏监控 + 轮巡计划」能力，是人工视频巡查的主力选型。

---

## 三、AI NVR / 智能视频分析（AI 巡查方向）

这类项目在摄像头流上跑本地 AI（YOLO / 视觉模型）做实时检测与告警，实现「AI 自动巡查」。

| 项目 | Star | License | 说明 |
| --- | --- | --- | --- |
| [Frigate](https://github.com/blakeblackshear/frigate) | 35.7k | MIT | **最火的 AI NVR**：IP 摄像头实时本地目标检测（人/车/宠物等），事件告警、录像检索，常配 Home Assistant。英文生态 |
| [owl](https://github.com/gowvp/owl) | 800 | 自定义 | GB28181-2022 NVR + 本地 YOLO 检测，自述为「Frigate 中文平替」，私有部署，更贴合国内摄像头 |
| [Viseron](https://github.com/roflcoopter/viseron) | 3.5k | MIT | 自托管本地 AI NVR，目标检测 / 人脸识别 / 运动检测 |
| [DeepCamera (SharpAI)](https://github.com/SharpAI/DeepCamera) | 3.0k | - | AI NVR + CCTV，支持本地 VLM（Qwen/DeepSeek/SmolVLM）视频分析 |
| [Scrypted](https://github.com/koush/scrypted) | 5.9k | 自定义 | 高性能视频集成与自动化平台，NVR 能力 + 插件生态 |
| [OpenVision](https://github.com/mossepoch/OpenVision) | 8 | Apache-2.0 | 视频 AI 智能检测企业级平台，明确覆盖**明厨亮灶、园区安防、火灾监测、抽烟、打架**等国内 ToB/ToG 场景 |
| [machina](https://github.com/PsyChip/machina) | 794 | - | OpenCV + YOLO + LLaVA 视频监控系统 |

---

## 四、视频墙 / 轮巡专用组件（最贴合「巡查」语义）

| 项目 | Star | License | 说明 |
| --- | --- | --- | --- |
| [video-monitor-wall](https://github.com/123beijixingxing/video-monitor-wall) | 1 | - | **精确命中「视频巡查」语义**：视频监控设备管理页面组件，直播流预览、录播回放、树形设备通道、拖拽到视频框墙播放、**批量定时轮巡视频任务播放计划**、播放速率/声音/清晰度控制 |
| [RotaNova/isc](https://github.com/RotaNova/isc) | 93 | Apache-2.0 | 智慧安防平台（Java + Vue），基于 ZLMediaKit，支持主流摄像头接入、AI 识别、跨境追踪、指挥大厅 |

---

## 五、传统 CCTV / 通用视频监控（国际通用，可参考）

| 项目 | Star | License | 说明 |
| --- | --- | --- | --- |
| [ZoneMinder](https://github.com/ZoneMinder/ZoneMinder) | 5.9k | GPL-2.0 | 老牌开源 CCTV 软件，IP/USB/模拟摄像头 |
| [Shinobi](https://github.com/moeiscool/Shinobi) | 1.4k | 自定义 | Node.js 开源 CCTV 平台 |
| [motioneye](https://github.com/motioneye-project/motioneyeos) | 8.2k | - | 单板机视频监控 OS |
| [camera.ui](https://github.com/cameraui/camera.ui) | 1.1k | - | 现代化本地优先的视频监控平台 |
| [Kerberos.io agent](https://github.com/kerberos-io/agent) | 1.1k | - | 可扩展的开源视频监控系统 |

---

## 六、融合通信 / 指挥调度（含 AR 巡检，边缘相关）

| 项目 | Star | License | 说明 |
| --- | --- | --- | --- |
| [ovmeet](https://github.com/ccallcn/ovmeet) | 223 | - | SIP 视频对讲、MCU 融屏、指挥调度、网页视频会议，支持 **AR 巡检**、执法记录仪、AR 眼镜 |

---

## 七、选型建议（按场景）

- **只想做「值班室视频巡查墙 + 轮巡」**：
  `WVP-GB28181-pro`（或 `AKStream`）接入摄像头 + 前端参考 `video-monitor-wall` 实现
  分屏轮巡播放计划。这是国内摄像头场景的最短路径。
- **要做「AI 自动巡查 / 事件告警」**：
  优先 `owl`（GB28181 + 本地 YOLO，中文生态、贴合国内），英文生态可选 `Frigate`；
  ToB/ToG 行业场景（明厨亮灶、园区、工地）可参考 `OpenVision` 的行业算法覆盖。
- **流媒体内核**：`ZLMediaKit`（GB28181）或 `SRS`，作为媒体接入层。

---

## 附：数据快照（GitHub API 查询时间 2026-09-07）

- WVP-GB28181-pro：7296⭐ / MIT / 最近推送 2026-08-29
- ZLMediaKit：17500⭐ / MIT
- Frigate：35672⭐ / MIT / 最近推送 2026-09-06
- owl：800⭐ / 最近推送 2026-08-31
- AKStream：1532⭐ / MIT / 最近推送 2026-08-13
- Scrypted：5897⭐ / 最近推送 2026-09-05
- ZoneMinder：5931⭐ / GPL-2.0 / 最近推送 2026-09-06
