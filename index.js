// 酒馆输入框修复助手 v3.19
// 功能：固定输入框高度 / 键盘弹起钉住输入栏 / 自动检测与自愈 / 扩展面板设置块（可折叠） / 更新检查
// v3.19 修复：
//  1) 更新失败原因直接红字显示在按钮那行，不再藏进检测日志
//  2) 删除误导性的兜底阶梯（官方源码证实 updateExtension 从不导出，纯死路，只会盖住真原因）
//  3) 兼容服务端返回 {error} 的失败形态
// 设置保存在浏览器 localStorage，不触碰聊天数据、角色卡、世界书、存档或 API 配置
(function () {
    'use strict';

    var VERSION = 'v3.19';
    var CURRENT_VERSION = '3.19.0'; // 与 manifest.json 同步
    var KEY = 'st-input-fix-settings';
    var IS_TOUCH = 'ontouchstart' in window;
    var KB_MIN = 80; // 判定为软键盘的最小高度（px），排除地址栏收起/展开的干扰
    var UPDATE_URL = 'https://raw.githubusercontent.com/smyzbrm/st-input-fix/main/manifest.json';

    var DEFAULTS = {
        enabled: true,
        height: 44,
        pinKeyboard: true,
        collapsed: false,
        focusAfterSend: false,
        autoAdjust: true,
        quickCollapse: true
    };
    var s = Object.assign({}, DEFAULTS);

    try {
        var saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && typeof saved === 'object') {
            Object.assign(s, saved);
        }
    } catch (e) { /* 忽略损坏的存档 */ }

    // 清洗存档：防坏数据（高度越界/非数字、布尔被存成字符串等）
    s.enabled = !!s.enabled;
    s.pinKeyboard = !!s.pinKeyboard;
    var hRaw = parseInt(s.height, 10);
    s.height = (isNaN(hRaw) || hRaw < 24) ? 44 : (hRaw > 120 ? 120 : hRaw);
    s.collapsed = !!s.collapsed;
    s.focusAfterSend = !!s.focusAfterSend;
    s.autoAdjust = s.autoAdjust !== false;
    s.quickCollapse = s.quickCollapse !== false;

    // 键盘收起动画期间的静默窗口（毫秒）
    var quietUntil = 0;

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    }

    function applyFix() {
        var ta = document.getElementById('send_textarea');
        if (!ta) return;
        if (!IS_TOUCH) return; // 桌面端不锁高度
        if (!s.enabled) {
            if (ta.style.height || ta.style.minHeight || ta.style.maxHeight || ta.style.resize || ta.style.overflowY) {
                ta.style.height = '';
                ta.style.minHeight = '';
                ta.style.maxHeight = '';
                ta.style.resize = '';
                ta.style.overflowY = '';
            }
            return;
        }
        var h = s.height + 'px';
        if (ta.style.height !== h || ta.style.minHeight !== h || ta.style.maxHeight !== h || ta.style.resize !== 'none' || ta.style.overflowY !== 'auto') {
            ta.style.height = h;
            ta.style.maxHeight = h;
            ta.style.minHeight = h;
            ta.style.resize = 'none';
            ta.style.overflowY = 'auto';
        }
    }

    // 键盘可见高度：innerHeight - vv.height
    // 不减去 offsetTop：输入时滚动聊天/页面会让 offsetTop 变化，减去它会把高度算小，
    // 掉到阈值下被误判“键盘收起”→ 输入栏掉下去（v3.12 根治）
    function kbHeight() {
        var vv = window.visualViewport;
        if (!vv) return 0;
        var kb = window.innerHeight - vv.height;
        return kb > 0 ? kb : 0;
    }

    // 收起确认防抖定时器（120ms 内不再收到“键盘还开着”的事件才真收起）
    var pendingCloseTimer = null;

    // 事件路径：键盘动画期间实时写入
    function pinSendForm(isDeferred) {
        var form = document.getElementById('send_form');
        if (!form) return;
        if (!s.enabled || !s.pinKeyboard) {
            if (pendingCloseTimer) { clearTimeout(pendingCloseTimer); pendingCloseTimer = null; }
            if (form.style.bottom) form.style.bottom = '';
            setKbOpen(false);
            return;
        }
        var kb = kbHeight();
        var inQuiet = Date.now() < quietUntil;
        if (inQuiet && kb <= KB_MIN) {
            setKbOpen(false);
            return; // 静默窗口内且键盘未重开：不做事
        }
        if (inQuiet) quietUntil = 0; // 静默窗口内键盘重开：取消静默，立即钉住
        var wasOpen = kbOpen;
        var openNow = kb > KB_MIN;
        if (wasOpen && !openNow && !isDeferred) {
            // 疑似收起：不立即清空，等 120ms 确认（瞬时抖动/滚动导致的误判不触发掉落）
            if (!pendingCloseTimer) {
                pendingCloseTimer = setTimeout(function () {
                    pendingCloseTimer = null;
                    pinSendForm(true);
                }, 120);
            }
            return;
        }
        if (pendingCloseTimer) { clearTimeout(pendingCloseTimer); pendingCloseTimer = null; }
        setKbOpen(openNow);
        if (s.quickCollapse && wasOpen && !openNow) {
            // 键盘真收了：立即归位，进入静默窗口，让回弹更顺
            if (form.style.bottom) form.style.bottom = '';
            quietUntil = Date.now() + 600;
            return;
        }
        // 位置钳制上限 512px：滚动时宁可稍浮高，绝不掉到键盘后面
        var target = openNow ? Math.min(kb, 512) + 'px' : '';
        if (form.style.bottom !== target) {
            form.style.bottom = target;
        }
    }

    // 自适应轮询：键盘弹起时 300ms 核对一次，收起后 1s（省电）
    var timer = null;
    var kbOpen = false;
    function setKbOpen(v) {
        if (kbOpen !== v) {
            kbOpen = v;
            refreshTimer();
        }
    }
    function refreshTimer() {
        if (timer) clearInterval(timer);
        timer = null;
        // 停用 / 桌面端 / 自动检测关闭 → 不跑轮询（省电，且保证“自动检测”开关真正生效）
        if (!s.enabled || !IS_TOUCH || !s.autoAdjust) return;
        var ms = kbOpen ? 300 : 1000;
        timer = setInterval(function () {
            if (Date.now() < quietUntil) return; // 收起动画期间静默
            applyFix();
            verifyPin();
        }, ms);
    }

    // 定时器职责：核对并自愈——钉住被顶掉→重钉；高度被改走→还原
    function verifyPin() {
        if (Date.now() < quietUntil) return; // 收起动画期间静默
        if (pendingCloseTimer) return; // 收起防抖挂起中：让防抖判定，定时器不抢先清空位置
        var form = document.getElementById('send_form');
        var ta = document.getElementById('send_textarea');
        if (!form || !s.enabled) return;
        var kb = kbHeight();
        var target = (s.pinKeyboard && kb > KB_MIN) ? Math.min(kb, 512) + 'px' : '';
        if (form.style.bottom !== target) {
            form.style.bottom = target;
            logStatus('键盘状态变化，已自动修正');
        }
        if (!IS_TOUCH || !ta) return;
        var cs = window.getComputedStyle(ta);
        var want = s.height + 'px';
        // 内联已正确但计算值仍不对 → 主题用 !important 压着，重复还原只会空转刷日志，跳过
        if (cs.height !== want && ta.style.height !== want) {
            ta.style.height = want;
            ta.style.minHeight = want;
            ta.style.maxHeight = want;
            logStatus('检测到输入框高度被改走，已自动还原');
        }
    }

    function applyAll() {
        var root = document.documentElement;
        if (s.enabled && IS_TOUCH) {
            root.style.setProperty('--stif-height', s.height + 'px');
        } else {
            root.style.setProperty('--stif-height', '');
        }
        applyFix();
        pinSendForm();
        updateFocusObserver();
        refreshTimer();
    }

    // 发送后自动聚焦（默认关）：只认新增的「用户消息」节点，AI 回复不触发
    var focusObserver = null;
    // 该新增节点内的 .mes.user 是否就是聊天最后一条消息（排除切角色/重载的批量重建）
    function isAtChatEnd(n) {
        var mes = (n.classList && n.classList.contains('mes') && n.classList.contains('user'))
            ? n
            : (n.querySelector ? n.querySelector('.mes.user') : null);
        if (!mes) return false;
        var all = document.querySelectorAll('#chat .mes.user');
        return all.length > 0 && all[all.length - 1] === mes;
    }
    function updateFocusObserver() {
        if (s.enabled && s.focusAfterSend && IS_TOUCH) {
            if (focusObserver) return;
            var chat = document.getElementById('chat');
            if (!chat || !window.MutationObserver) return;
            var firstRun = true;
            focusObserver = new MutationObserver(function (muts) {
                if (firstRun) { firstRun = false; return; }
                // 只接受「恰好新增 1 条 .mes.user」且位于聊天末尾 → 真正的发送，而非批量重建
                var foundMes = null;
                for (var i = 0; i < muts.length; i++) {
                    var added = muts[i].addedNodes;
                    for (var j = 0; j < added.length; j++) {
                        var n = added[j];
                        if (!n || n.nodeType !== 1) continue;
                        var mes = (n.classList && n.classList.contains('mes') && n.classList.contains('user'))
                            ? n
                            : (n.querySelector ? n.querySelector('.mes.user') : null);
                        if (!mes) continue;
                        if (foundMes === null) {
                            foundMes = mes;
                        } else if (foundMes !== mes) {
                            foundMes = null; // 一批多条 → 批量重建，跳过
                            i = muts.length;
                            break;
                        }
                    }
                }
                if (foundMes && isAtChatEnd(foundMes) && document.visibilityState !== 'hidden') {
                    var ta = document.getElementById('send_textarea');
                    if (ta && document.activeElement !== ta) {
                        try { ta.focus(); } catch (e) {}
                    }
                }
            });
            focusObserver.observe(chat, { childList: true });
        } else if (focusObserver) {
            focusObserver.disconnect();
            focusObserver = null;
        }
    }

    applyAll();

    // 触屏端挂键盘事件（实时写入路径）
    if (IS_TOUCH && window.visualViewport) {
        var rafPending = false;
        function schedulePin() {
            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(function () {
                rafPending = false;
                pinSendForm();
            });
        }
        window.visualViewport.addEventListener('resize', schedulePin);
        window.visualViewport.addEventListener('scroll', schedulePin);
    }

    // ---- 面板检测日志 ----
    var lastLog = '';
    function logStatus(msg) {
        lastLog = msg;
        var el = document.getElementById('stif-statuslog');
        if (el) el.textContent = '最近检测：' + msg;
    }

    // ---- 更新检查 ----
    function cmpVersion(a, b) {
        var pa = String(a).split('.').map(function (x) { return parseInt(x, 10) || 0; });
        var pb = String(b).split('.').map(function (x) { return parseInt(x, 10) || 0; });
        for (var i = 0; i < 3; i++) {
            var va = pa[i] || 0, vb = pb[i] || 0;
            if (va > vb) return 1;
            if (va < vb) return -1;
        }
        return 0;
    }
    function setUpdateLine(msg, isUpdate) {
        var el = document.getElementById('stif-update');
        if (!el) return;
        el.textContent = msg;
        el.style.color = isUpdate ? '#cf222e' : '';
    }
    // 三源兜底取最新 manifest：GitHub API（无缓存）→ raw 带时间戳 → jsDelivr 镜像
    function checkUpdate() {
        var el = document.getElementById('stif-update');
        if (!el) return;
        el.textContent = '检查更新中…';
        el.style.color = '';
        var sources = [
            'https://api.github.com/repos/smyzbrm/st-input-fix/contents/manifest.json',
            UPDATE_URL + '?t=' + Date.now(),
            'https://cdn.jsdelivr.net/gh/smyzbrm/st-input-fix@main/manifest.json'
        ];
        function tryNext(i) {
            if (i >= sources.length) {
                setUpdateLine('检查失败（网络），点此重试', false);
                return;
            }
            fetch(sources[i], { cache: 'no-store' })
                .then(function (r) {
                    if (!r.ok) throw new Error('http ' + r.status);
                    return r.text();
                })
                .then(function (txt) {
                    var m = null;
                    if (sources[i].indexOf('api.github.com') !== -1) {
                        // GitHub API 返回 base64，先解码再解析
                        var j = JSON.parse(txt);
                        m = (j && j.content) ? JSON.parse(atob(j.content)) : null;
                    } else {
                        m = JSON.parse(txt);
                    }
                    if (!m || !m.version) throw new Error('bad manifest');
                    var latest = String(m.version);
                    if (cmpVersion(latest, CURRENT_VERSION) > 0) {
                        setUpdateLine('发现新版本 v' + latest + '（当前 v' + CURRENT_VERSION + '），点击更新', true);
                    } else {
                        setUpdateLine('当前已是最新版本 v' + CURRENT_VERSION, false);
                    }
                })
                .catch(function () { tryNext(i + 1); });
        }
        tryNext(0);
    }
    // 主通道：直接调用酒馆官方更新接口（对照官方源码实现）
    // 先尝试从 script.js 导入官方 getRequestHeaders；导入失败则用自带请求头，
    // 确保 POST 一定能发出去（酒馆的 POST 接口只需 Content-Type: application/json）
    function tryApiUpdate() {
        var officialHeaders = null;
        return import('../../../script.js')
            .then(function (mod) {
                var getHeaders = mod.getRequestHeaders || (mod.default && mod.default.getRequestHeaders);
                if (typeof getHeaders === 'function') {
                    officialHeaders = getHeaders();
                }
                return officialHeaders || { 'Content-Type': 'application/json' };
            })
            .catch(function (e) {
                logStatus('导入 script.js 失败，使用自带请求头：' + (e && e.message ? e.message : e));
                return { 'Content-Type': 'application/json' };
            })
            .then(function (headers) {
                return fetch('/api/extensions/update', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ extensionName: 'st-input-fix', global: false })
                });
            })
            .then(function (resp) {
                if (!resp.ok) {
                    return resp.text().then(function (t) { throw new Error('HTTP ' + resp.status + ' ' + t); });
                }
                return resp.json();
            })
            .then(function (data) {
                if (data && data.error) {
                    throw new Error(String(data.error));
                }
                if (data && data.isUpToDate) {
                    setUpdateLine('已是最新版本 v' + CURRENT_VERSION, false);
                    logStatus('一键更新：已是最新版本');
                } else {
                    var hash = data && data.shortCommitHash ? '（commit ' + data.shortCommitHash + '）' : '';
                    setUpdateLine('更新成功' + hash + '，重启酒馆后生效', false);
                    logStatus('一键更新：成功' + hash + '，重启后生效');
                }
                return true;
            })
            .catch(function (e) {
                var msg = e && e.message ? e.message : String(e);
                logStatus('更新接口失败：' + msg);
                setUpdateLine('更新失败：' + msg, false);
                return false;
            });
    }
    var updating = false; // 更新防重入：双重点击不会并发两个请求
    function doUpdate() {
        var el = document.getElementById('stif-update');
        if (!el || updating) return;
        updating = true;
        el.textContent = '正在更新，请稍候…';
        el.style.color = '';
        tryApiUpdate().then(function (ok) {
            if (!ok) logStatus('一键更新失败，原因见上方红字');
            updating = false;
        });
    }

    // ---- 扩展面板设置块 ----
    function buildUI() {
        var container = document.getElementById('extensions_settings');
        if (!container) return;
        var panel = document.getElementById('st-input-fix-panel');
        if (panel) return; // 已存在

        var html = '' +
            '<div id="st-input-fix-panel" style="margin-top:10px;border:1px solid var(--SmartThemeBorderColor, #d0d7de);border-radius:8px;background:var(--SmartThemeBlurTintColor, #f6f8fa);overflow:hidden;color:var(--SmartThemeBodyColor, #1f3a34);">' +
            '<div id="stif-header" style="display:flex;align-items:center;gap:6px;padding:10px 12px;cursor:pointer;user-select:none;font-weight:700;">' +
            '<span id="stif-caret" style="display:inline-block;width:14px;">▾</span>' +
            '<span id="stif-dot" style="display:inline-block;width:10px;">●</span>酒馆输入框修复助手' +
            '<span id="stif-ver" style="margin-left:auto;font-size:12px;font-weight:400;opacity:0.7;">' + VERSION + '</span>' +
            '</div>' +
            '<div id="stif-body" style="padding:0 12px 12px;display:flex;flex-direction:column;gap:8px;font-size:14px;">' +
            '<div id="stif-summary" style="font-size:12px;opacity:0.75;"></div>' +
            '<div id="stif-statuslog" style="font-size:12px;opacity:0.75;background:var(--SmartThemeBodyBackground, #eef3f1);border-radius:4px;padding:4px 6px;">最近检测：等待中</div>' +
            '<div id="stif-update" style="font-size:12px;cursor:pointer;padding:4px 6px;border:1px dashed var(--SmartThemeBorderColor, #cfe0da);border-radius:4px;text-align:center;">检查更新中…</div>' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-enabled" style="width:16px;height:16px;"> 启用修复</label>' +
            '<div style="display:flex;align-items:center;gap:6px;">输入框高度 <button id="stif-dec" type="button" style="padding:2px 10px;">−</button> <input type="number" id="stif-height" min="24" max="120" step="1" style="width:62px;"> <button id="stif-inc" type="button" style="padding:2px 10px;">+</button> px</div>' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-pin" style="width:16px;height:16px;"> 键盘弹起时钉住输入栏</label>' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-quick" style="width:16px;height:16px;"> 收起快速归位（键盘回弹更顺）</label>' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-auto" style="width:16px;height:16px;"> 自动检测并调节（异常自动修复）</label>' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-focus" style="width:16px;height:16px;"> 发送后自动聚焦输入框（连聊不用再点）</label>' +
            '<div style="display:flex;align-items:center;gap:8px;"><button id="stif-check" type="button" style="padding:4px 12px;">立即自检</button><button id="stif-reset" type="button" style="padding:4px 12px;">恢复默认</button></div>' +
            '<div style="font-size:12px;opacity:0.7;">修改即时生效，只影响输入框样式，不碰存档与角色卡</div>' +
            '</div></div>';
        container.insertAdjacentHTML('beforeend', html);

        var cbEnable = document.getElementById('stif-enabled');
        var numHeight = document.getElementById('stif-height');
        var cbPin = document.getElementById('stif-pin');
        var cbQuick = document.getElementById('stif-quick');
        var cbAuto = document.getElementById('stif-auto');
        var cbFocus = document.getElementById('stif-focus');
        var btnReset = document.getElementById('stif-reset');
        var btnCheck = document.getElementById('stif-check');
        var btnDec = document.getElementById('stif-dec');
        var btnInc = document.getElementById('stif-inc');
        var header = document.getElementById('stif-header');
        var body = document.getElementById('stif-body');
        var caret = document.getElementById('stif-caret');
        var dot = document.getElementById('stif-dot');
        var summary = document.getElementById('stif-summary');
        var upd = document.getElementById('stif-update');

        function refreshUI() {
            cbEnable.checked = !!s.enabled;
            numHeight.value = s.height;
            cbPin.checked = !!s.pinKeyboard;
            cbQuick.checked = !!s.quickCollapse;
            cbAuto.checked = !!s.autoAdjust;
            cbFocus.checked = !!s.focusAfterSend;
            body.style.display = s.collapsed ? 'none' : 'flex';
            caret.textContent = s.collapsed ? '▸' : '▾';
            dot.style.color = s.enabled ? '#2da44e' : '#8c959f';
            var parts = [];
            if (s.enabled) {
                parts.push('已启用');
                parts.push('高度 ' + s.height + 'px');
                parts.push('键盘钉住 ' + (s.pinKeyboard ? '开' : '关'));
                parts.push('快回 ' + (s.quickCollapse ? '开' : '关'));
                parts.push('自动调节 ' + (s.autoAdjust ? '开' : '关'));
                parts.push('发送聚焦 ' + (s.focusAfterSend ? '开' : '关'));
            } else {
                parts.push('已停用（样式已还原）');
            }
            summary.textContent = parts.join(' · ');
            var logEl = document.getElementById('stif-statuslog');
            if (logEl) logEl.textContent = lastLog ? ('最近检测：' + lastLog) : '最近检测：等待中';
        }

        function bumpHeight(delta) {
            var v = s.height + delta;
            if (v < 24) v = 24;
            if (v > 120) v = 120;
            s.height = v;
            numHeight.value = v;
            save();
            applyAll();
            refreshUI();
        }

        function selfCheck() {
            var ta = document.getElementById('send_textarea');
            var form = document.getElementById('send_form');
            if (!ta || !form) {
                logStatus('找不到输入框元素（页面还没加载完）');
                refreshUI();
                return;
            }
            var cs = window.getComputedStyle(ta);
            var want = s.height + 'px';
            var kb = kbHeight();
            var parts = [];
            parts.push('扩展 ' + (s.enabled ? '启用' : '停用'));
            if (s.enabled) {
                if (cs.height === want) {
                    parts.push('高度 正常');
                } else if (ta.style.height === want) {
                    // 内联已正确但计算值不对 → 主题 !important 锁死，自愈已让位，如实显示
                    parts.push('高度 被主题锁定（无法覆盖）');
                } else {
                    ta.style.height = want;
                    ta.style.minHeight = want;
                    ta.style.maxHeight = want;
                    parts.push('高度 异常→已还原');
                }
                parts.push('键盘 ' + (kb > KB_MIN ? '弹起中' : '收起'));
                parts.push('钉住 ' + (form.style.bottom ? '生效' : '待命'));
            }
            logStatus(parts.join(' · '));
            refreshUI();
        }

        header.addEventListener('click', function () {
            s.collapsed = !s.collapsed;
            save();
            refreshUI();
        });
        upd.addEventListener('click', function () {
            var t = upd.textContent;
            if (t.indexOf('点击更新') !== -1) {
                doUpdate();
            } else {
                checkUpdate(); // 已最新/失败 → 重查
            }
        });

        cbEnable.addEventListener('change', function () {
            s.enabled = cbEnable.checked;
            save();
            applyAll();
            refreshUI();
        });
        numHeight.addEventListener('change', function () {
            var v = parseInt(numHeight.value, 10);
            if (isNaN(v) || v < 24) v = 24;
            if (v > 120) v = 120;
            s.height = v;
            numHeight.value = v;
            save();
            applyAll();
            refreshUI();
        });
        cbPin.addEventListener('change', function () {
            s.pinKeyboard = cbPin.checked;
            save();
            applyAll();
            refreshUI();
        });
        cbQuick.addEventListener('change', function () {
            s.quickCollapse = cbQuick.checked;
            save();
            applyAll();
            refreshUI();
        });
        cbAuto.addEventListener('change', function () {
            s.autoAdjust = cbAuto.checked;
            save();
            applyAll();
            logStatus(s.autoAdjust ? '自动检测已开启' : '自动检测已关闭（不再自动修复）');
            refreshUI();
        });
        cbFocus.addEventListener('change', function () {
            s.focusAfterSend = cbFocus.checked;
            save();
            applyAll();
            refreshUI();
        });
        btnDec.addEventListener('click', function () { bumpHeight(-4); });
        btnInc.addEventListener('click', function () { bumpHeight(4); });
        btnCheck.addEventListener('click', selfCheck);
        btnReset.addEventListener('click', function () {
            Object.assign(s, DEFAULTS);
            save();
            applyAll();
            logStatus('已恢复默认设置');
            refreshUI();
        });

        refreshUI();
        checkUpdate(); // 面板就绪后立即查一次更新
        setInterval(checkUpdate, 30 * 60 * 1000); // 每 30 分钟复查
    }

    // 面板容器晚加载时延迟重试，最多 5 次
    try {
        if (document.getElementById('extensions_settings')) {
            buildUI();
        } else {
            (function retry() {
                var tries = 0;
                var step = function () {
                    tries++;
                    if (tries > 5) return;
                    setTimeout(function () {
                        if (document.getElementById('extensions_settings')) {
                            buildUI();
                        } else {
                            step();
                        }
                    }, 1000);
                };
                step();
            })();
        }
    } catch (e) { /* UI 构建失败不影响核心修复 */ }
})();
