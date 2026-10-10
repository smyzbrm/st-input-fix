// 酒馆输入框修复助手 v3.2
// 功能：固定输入框高度 / 键盘弹起钉住输入栏 / 扩展面板设置块（可折叠）
// v3.2 新增：面板显示版本号+生效状态摘要+状态点；高度 ±4px 微调按钮；暗色主题适配；
//           「发送后自动聚焦输入框」可选开关（默认关，不影响原有体验）
// 设置保存在浏览器 localStorage，不触碰聊天数据、角色卡、世界书、存档或 API 配置
(function () {
    'use strict';

    var VERSION = 'v3.2';
    var KEY = 'st-input-fix-settings';
    var DEFAULTS = { enabled: true, height: 44, pinKeyboard: true, collapsed: false, focusAfterSend: false };
    var s = Object.assign({}, DEFAULTS);

    try {
        var saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && typeof saved === 'object') {
            Object.assign(s, saved);
        }
    } catch (e) { /* 忽略损坏的存档 */ }

    s.collapsed = !!s.collapsed;
    s.focusAfterSend = !!s.focusAfterSend;

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

    function pinSendForm() {
        var form = document.getElementById('send_form');
        if (!form) return;
        if (!s.enabled || !s.pinKeyboard) {
            if (form.style.bottom) form.style.bottom = '';
            return;
        }
        var vv = window.visualViewport;
        if (!vv) return;
        var kb = window.innerHeight - vv.height - vv.offsetTop;
        var target = kb > 20 ? kb + 'px' : '';
        if (form.style.bottom !== target) {
            form.style.bottom = target;
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
    }

    // 发送后自动聚焦（默认关）：仅当开启且启用时，检测到新消息节点出现就归还焦点
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

    // 低频兜底：酒馆重渲染后新元素也要被处理；值没变时内部直接跳过
    setInterval(function () {
        applyFix();
        pinSendForm();
    }, 1000);

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
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-enabled" style="width:16px;height:16px;"> 启用修复</label>' +
            '<div style="display:flex;align-items:center;gap:6px;">输入框高度 <button id="stif-dec" type="button" style="padding:2px 10px;">−</button> <input type="number" id="stif-height" min="24" max="120" step="1" style="width:62px;"> <button id="stif-inc" type="button" style="padding:2px 10px;">+</button> px</div>' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-pin" style="width:16px;height:16px;"> 键盘弹起时钉住输入栏</label>' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-focus" style="width:16px;height:16px;"> 发送后自动聚焦输入框（连聊不用再点）</label>' +
            '<div><button id="stif-reset" type="button" style="padding:4px 12px;">恢复默认</button></div>' +
            '<div style="font-size:12px;opacity:0.7;">修改即时生效，只影响输入框样式，不碰存档与角色卡</div>' +
            '</div></div>';
        container.insertAdjacentHTML('beforeend', html);

        var cbEnable = document.getElementById('stif-enabled');
        var numHeight = document.getElementById('stif-height');
        var cbPin = document.getElementById('stif-pin');
        var cbFocus = document.getElementById('stif-focus');
        var btnReset = document.getElementById('stif-reset');
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
            cbFocus.checked = !!s.focusAfterSend;
            body.style.display = s.collapsed ? 'none' : 'flex';
            caret.textContent = s.collapsed ? '▸' : '▾';
            dot.style.color = s.enabled ? '#2da44e' : '#8c959f';
            var parts = [];
            if (s.enabled) {
                parts.push('已启用');
                parts.push('高度 ' + s.height + 'px');
                parts.push('键盘钉住 ' + (s.pinKeyboard ? '开' : '关'));
                parts.push('发送聚焦 ' + (s.focusAfterSend ? '开' : '关'));
            } else {
                parts.push('已停用（样式已还原）');
            }
            summary.textContent = parts.join(' · ');
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
        cbFocus.addEventListener('change', function () {
            s.focusAfterSend = cbFocus.checked;
            save();
            applyAll();
            refreshUI();
        });
        btnDec.addEventListener('click', function () { bumpHeight(-4); });
        btnInc.addEventListener('click', function () { bumpHeight(4); });
        btnReset.addEventListener('click', function () {
            Object.assign(s, DEFAULTS);
            save();
            applyAll();
            refreshUI();
        });

        refreshUI();
    }

    try {
        buildUI();
    } catch (e) { /* UI 构建失败不影响核心修复 */ }
})();
