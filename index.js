// 酒馆输入框修复助手 v3.3
// 功能：固定输入框高度 / 键盘弹起钉住输入栏 / 扩展面板设置块（可折叠）
// v3.3 新增「自动检测与自愈」：检测键盘钉住是否被顶掉、输入框高度是否被改走、键盘弹收是否异常，
//       发现即自动修复；键盘弹起期间轮询加速到 300ms 防复发，收起后回到 1s 省电；
//       面板新增「立即自检」按钮与检测日志行，可随时查看它做了什么
// 设置保存在浏览器 localStorage，不触碰聊天数据、角色卡、世界书、存档或 API 配置
(function () {
    'use strict';

    var VERSION = 'v3.3';
    var KEY = 'st-input-fix-settings';
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

    // ---- 键盘钉住 ----
    var kbOpen = false;
    var kbVerifyTimer = null;

    function pinSendForm() {
        var form = document.getElementById('send_form');
        if (!form) return;
        if (!s.enabled || !s.pinKeyboard) {
            if (form.style.bottom) form.style.bottom = '';
            setKbOpen(false);
            return;
        }
        var vv = window.visualViewport;
        if (!vv) return;
        var kb = window.innerHeight - vv.height - vv.offsetTop;
        setKbOpen(kb > 20);
        var target = kb > 20 ? kb + 'px' : '';
        if (form.style.bottom !== target) {
            form.style.bottom = target;
        }
        if (s.autoAdjust) {
            // 键盘动画结束后 250ms 复核一次，被顶掉就立刻修正
            clearTimeout(kbVerifyTimer);
            kbVerifyTimer = setTimeout(verifyPin, 250);
        }
    }

    // 自适应轮询：键盘弹起时加密到 300ms，收起后回到 1s
    var timer = null;
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
            pinSendForm();
        }, ms);
    }

    // 复核：钉住被顶掉→重钉；输入框高度被改走→还原
    function verifyPin() {
        var form = document.getElementById('send_form');
        var ta = document.getElementById('send_textarea');
        var vv = window.visualViewport;
        if (!form || !ta || !s.enabled) return;
        var kb = vv ? (window.innerHeight - vv.height - vv.offsetTop) : 0;
        var target = (s.pinKeyboard && kb > 20) ? kb + 'px' : '';
        if (form.style.bottom !== target) {
            form.style.bottom = target;
            logStatus('检测到键盘钉住被顶掉，已自动修正');
        }
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
        if (s.enabled) {
            root.style.setProperty('--stif-height', s.height + 'px');
        } else {
            root.style.setProperty('--stif-height', '');
        }
        applyFix();
        pinSendForm();
        updateFocusObserver();
        refreshTimer();
    }

    // 发送后自动聚焦（默认关）
    var focusObserver = null;
    function updateFocusObserver() {
        if (s.enabled && s.focusAfterSend) {
            if (focusObserver) return;
            var chat = document.getElementById('chat');
            if (!chat || !window.MutationObserver) return;
            var firstRun = true;
            focusObserver = new MutationObserver(function () {
                if (firstRun) { firstRun = false; return; }
                var ta = document.getElementById('send_textarea');
                if (ta && document.activeElement !== ta) {
                    try { ta.focus(); } catch (e) {}
                }
            });
            focusObserver.observe(chat, { childList: true });
        } else if (focusObserver) {
            focusObserver.disconnect();
            focusObserver = null;
        }
    }

    applyAll();

    // 仅在移动端挂键盘事件
    if ('ontouchstart' in window && window.visualViewport) {
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
            var vv = window.visualViewport;
            var kb = vv ? (window.innerHeight - vv.height - vv.offsetTop) : 0;
            var parts = [];
            parts.push('扩展 ' + (s.enabled ? '启用' : '停用'));
            if (s.enabled) {
                parts.push('高度 ' + (cs.height === want ? '正常' : '异常→已还原'));
                if (cs.height !== want) {
                    ta.style.height = want;
                    ta.style.minHeight = want;
                    ta.style.maxHeight = want;
                }
                parts.push('键盘 ' + (kb > 20 ? '弹起中' : '收起'));
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
