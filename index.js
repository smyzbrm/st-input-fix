// 酒馆输入框修复助手 v3.0
// 新增：扩展面板里的设置块（总开关 / 输入框高度 / 键盘钉住 / 恢复默认），修改即时生效
// 设置保存在浏览器 localStorage，不触碰聊天数据、角色卡、世界书、存档或 API 配置
(function () {
    'use strict';

    var KEY = 'st-input-fix-settings';
    var DEFAULTS = { enabled: true, height: 44, pinKeyboard: true };
    var s = Object.assign({}, DEFAULTS);

    try {
        var saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && typeof saved === 'object') {
            Object.assign(s, saved);
        }
    } catch (e) { /* 忽略损坏的存档 */ }

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

    // 把当前设置同步到 CSS 变量（关闭时置空，让样式回落到酒馆默认）
    function applyAll() {
        var root = document.documentElement;
        if (s.enabled) {
            root.style.setProperty('--stif-height', s.height + 'px');
        } else {
            root.style.setProperty('--stif-height', '');
        }
        applyFix();
        pinSendForm();
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
            '<div id="st-input-fix-panel" style="margin-top:10px;padding:12px;border:1px solid var(--SmartThemeBorderColor, #d0d7de);border-radius:8px;background:var(--SmartThemeBlurTintColor, #f6f8fa);">' +
            '<div style="font-weight:700;margin-bottom:8px;">酒馆输入框修复助手</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px;font-size:14px;">' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-enabled" style="width:16px;height:16px;"> 启用修复</label>' +
            '<div style="display:flex;align-items:center;gap:6px;">输入框高度 <input type="number" id="stif-height" min="24" max="120" step="1" style="width:70px;"> px</div>' +
            '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="stif-pin" style="width:16px;height:16px;"> 键盘弹起时钉住输入栏</label>' +
            '<div><button id="stif-reset" type="button" style="padding:4px 12px;">恢复默认</button></div>' +
            '<div style="font-size:12px;opacity:0.7;">修改即时生效，只影响输入框样式，不碰存档与角色卡</div>' +
            '</div></div>';
        container.insertAdjacentHTML('beforeend', html);

        var cbEnable = document.getElementById('stif-enabled');
        var numHeight = document.getElementById('stif-height');
        var cbPin = document.getElementById('stif-pin');
        var btnReset = document.getElementById('stif-reset');

        function refreshUI() {
            cbEnable.checked = !!s.enabled;
            numHeight.value = s.height;
            cbPin.checked = !!s.pinKeyboard;
        }

        cbEnable.addEventListener('change', function () {
            s.enabled = cbEnable.checked;
            save();
            applyAll();
        });
        numHeight.addEventListener('change', function () {
            var v = parseInt(numHeight.value, 10);
            if (isNaN(v) || v < 24) v = 24;
            if (v > 120) v = 120;
            s.height = v;
            numHeight.value = v;
            save();
            applyAll();
        });
        cbPin.addEventListener('change', function () {
            s.pinKeyboard = cbPin.checked;
            save();
            pinSendForm();
        });
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
