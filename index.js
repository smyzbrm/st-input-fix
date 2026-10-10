// 酒馆输入框修复助手 v3.4
// 功能：固定输入框高度 / 键盘弹起钉住输入栏 / 自动检测与自愈 / 扩展面板设置块（可折叠）
// v3.4 优化：
//  1) 键盘识别更准：阈值提到 80px，手机浏览器地址栏收起不再被误判成键盘
//  2) 发送聚焦只认「用户消息」节点，AI 回复不再误弹键盘
//  3) 桌面端自动不锁高度：非触屏设备保持酒馆原生输入框行为
//  4) 职责分离：事件负责实时写入，定时器只做核对，写入更少更省
// 设置保存在浏览器 localStorage，不触碰聊天数据、角色卡、世界书、存档或 API 配置
(function () {
    'use strict';

    var VERSION = 'v3.4';
    var KEY = 'st-input-fix-settings';
    var IS_TOUCH = 'ontouchstart' in window;
    var KB_MIN = 80; // 判定为软键盘的最小高度（px），排除地址栏收起/展开的干扰

    var DEFAULTS = {
        enabled: true,
        height: 44,
        pinKeyboard: true,
        collapsed: false,
        focusAfterSend: false,
        autoAdjust: true
    };
    var s = Object.assign({}, DEFAULTS);

    try {
        var saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && typeof saved === 'object') {
            Object.assign(s, saved);
        }
    } catch (e) { /* 忽略损坏的存档 */ }

    s.collapsed = !!s.collapsed;
    s.focusAfterSend = !!s.focusAfterSend;
    s.autoAdjust = s.autoAdjust !== false;

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
        if (ta.style.height !== h || ta.style.minHeight !== h || ta.style.maxHeight !== h) {
            ta.style.height = h;
            ta.style.maxHeight = h;
            ta.style.minHeight = h;
            ta.style.resize = 'none';
            ta.style.overflowY = 'auto';
        }
    }

    function kbHeight() {
        var vv = window.visualViewport;
        if (!vv) return 0;
        return window.innerHeight - vv.height - vv.offsetTop;
    }

    // 事件路径：键盘动画期间实时写入
    function pinSendForm() {
        var form = document.getElementById('send_form');
        if (!form) return;
        if (!s.enabled || !s.pinKeyboard) {
            if (form.style.bottom) form.style.bottom = '';
            setKbOpen(false);
            return;
        }
        var kb = kbHeight();
        setKbOpen(kb > KB_MIN);
        var target = kb > KB_MIN ? kb + 'px' : '';
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
        var ms = (s.autoAdjust && kbOpen) ? 300 : 1000;
        timer = setInterval(function () {
            applyFix();
            verifyPin();
        }, ms);
    }

    // 定时器职责：核对并自愈——钉住被顶掉→重钉；高度被改走→还原
    function verifyPin() {
        var form = document.getElementById('send_form');
        var ta = document.getElementById('send_textarea');
        if (!form || !s.enabled) return;
        var kb = kbHeight();
        var target = (s.pinKeyboard && kb > KB_MIN) ? kb + 'px' : '';
        if (form.style.bottom !== target) {
            form.style.bottom = target;
            logStatus('检测到键盘钉住被顶掉，已自动修正');
        }
        if (!IS_TOUCH || !ta) return;
        var cs = window.getComputedStyle(ta);
        var want = s.height + 'px';
        if (cs.height !== want) {
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
    function isUserMessageNode(n) {
        if (!n || n.nodeType !== 1) return false;
        if (n.classList && n.classList.contains('mes') && n.classList.contains('user')) return true;
        if (n.querySelector && n.querySelector('.mes.user')) return true;
        return false;
    }
    function updateFocusObserver() {
        if (s.enabled && s.focusAfterSend && IS_TOUCH) {
            if (focusObserver) return;
            var chat = document.getElementById('chat');
            if (!chat || !window.MutationObserver) return;
            var firstRun = true;
            focusObserver = new MutationObserver(function (muts) {
                if (firstRun) { firstRun = false; return; }
                var found = false;
                for (var i = 0; i < muts.length && !found; i++) {
                    var added = muts[i].addedNodes;
                    for (var j = 0; j < added.length; j++) {
                        if (isUserMessageNode(added[j])) { found = true; break; }
                    }
                }
                if (found) {
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
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-enabled" style="width:16px;height:16px;"> 启用修复</label>' +
            '<div style="display:flex;align-items:center;gap:6px;">输入框高度 <button id="stif-dec" type="button" style="padding:2px 10px;">−</button> <input type="number" id="stif-height" min="24" max="120" step="1" style="width:62px;"> <button id="stif-inc" type="button" style="padding:2px 10px;">+</button> px</div>' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-pin" style="width:16px;height:16px;"> 键盘弹起时钉住输入栏</label>' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-auto" style="width:16px;height:16px;"> 自动检测并调节（异常自动修复）</label>' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-focus" style="width:16px;height:16px;"> 发送后自动聚焦输入框（连聊不用再点）</label>' +
            '<div style="display:flex;align-items:center;gap:8px;"><button id="stif-check" type="button" style="padding:4px 12px;">立即自检</button><button id="stif-reset" type="button" style="padding:4px 12px;">恢复默认</button></div>' +
            '<div style="font-size:12px;opacity:0.7;">修改即时生效，只影响输入框样式，不碰存档与角色卡</div>' +
            '</div></div>';
        container.insertAdjacentHTML('beforeend', html);

        var cbEnable = document.getElementById('stif-enabled');
        var numHeight = document.getElementById('stif-height');
        var cbPin = document.getElementById('stif-pin');
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

        function refreshUI() {
            cbEnable.checked = !!s.enabled;
            numHeight.value = s.height;
            cbPin.checked = !!s.pinKeyboard;
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
                parts.push('高度 ' + (cs.height === want ? '正常' : '异常→已还原'));
                if (cs.height !== want) {
                    ta.style.height = want;
                    ta.style.minHeight = want;
                    ta.style.maxHeight = want;
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
        cbAuto.addEventListener('change', function () {
            s.autoAdjust = cbAuto.checked;
            save();
            applyAll();
            refreshUI();
            logStatus(s.autoAdjust ? '自动检测已开启' : '自动检测已关闭');
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
            refreshUI();
            logStatus('已恢复默认设置');
            refreshUI();
        });

        refreshUI();
    }

    try {
        buildUI();
    } catch (e) { /* UI 构建失败不影响核心修复 */ }
})();
