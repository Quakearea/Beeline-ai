// ==UserScript==
// @name         芯位教育网课助手
// @namespace    https://github.com/Quakearea/Beeline-ai
// @version      3.1.0
// @description  适配后台播放和默认静音;适配新版UI；新增DeepSeek AI智能答题功能；优化已答题检测，避免重复答题；主要功能：芯位教育自动播放下一课，跳过作业、文档、问卷，智能答题自动提交；专注于帮助大学生从网课中释放出来 让自己的时间把握在自己的手中。
// @author       Quakearea
// @match        *://*.beeline-ai.com/*
// @icon         *://*.beeline-ai.com/*
// @grant        none
// @run-at document-end
// @license GPL-3.0 license
// ==/UserScript==

function addFullscreenErrorHandler() {
    // 捕获全屏操作错误
    const originalExitFullscreen = Document.prototype.exitFullscreen;
    Document.prototype.exitFullscreen = function() {
        return originalExitFullscreen.call(this).catch(error => {
            if (error.name === 'TypeError' && error.message.includes('Document not active')) {
                console.log('安全忽略全屏退出错误：文档未激活');
                return Promise.resolve(); // 返回成功的Promise
            }
            throw error; // 重新抛出其他错误
        });
    };
}

// 在脚本开始时调用
addFullscreenErrorHandler();



(function() {
    'use strict';

    // 更安全的方式：只阻止页面的visibilitychange处理，但不影响浏览器原生功能
    let isScriptHandlingVisibility = false;

    // 保存原始方法
    const originalAddEventListener = EventTarget.prototype.addEventListener;

    EventTarget.prototype.addEventListener = function(type, listener, options) {
        // 只拦截页面脚本的visibilitychange监听，不拦截视频播放器等系统组件的
        if (type === 'visibilitychange' &&
            !this._isVideoPlayerElement && // 排除视频播放器相关元素
            !listener.toString().includes('VideoPlayer') && // 排除包含VideoPlayer的函数
            !isScriptHandlingVisibility) {

            console.log('已阻止页面的visibilitychange事件监听:', listener);
            return; // 只阻止页面的监听，不阻止播放器的
        }
        originalAddEventListener.call(this, type, listener, options);
    };

    // 重写visibilityState和hidden属性，但更安全的方式
    let isFixed = false;

    function safeFixVisibility() {
        if (isFixed) return;

        try {
            Object.defineProperty(document, 'hidden', {
                get: function() { return false; }
            });

            Object.defineProperty(document, 'visibilityState', {
                get: function() { return 'visible'; }
            });

            isFixed = true;
            console.log('安全地修复了可见性状态');
        } catch (error) {
            console.warn('修复可见性状态失败:', error);
        }
    }

    // 延迟执行，避免与播放器初始化冲突
    setTimeout(safeFixVisibility, 2000);
})();

// 功能控制状态
let autoNextEnabled = true;  // 自动下一个视频功能开关
let muteEnabled = true;      // 静音功能开关

// 创建悬浮窗UI
function createFloatingWindow() {
    // 创建悬浮窗容器
    const floatingWindow = document.createElement('div');
    floatingWindow.id = 'xinwei-floating-window';
    floatingWindow.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 50%;
        cursor: pointer;
        z-index: 999999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: white;
        user-select: none;
    `;
    floatingWindow.innerHTML = '🎮';
    floatingWindow.title = '芯位教育助手 - 点击打开控制面板';

    // 创建控制面板
    const controlPanel = document.createElement('div');
    controlPanel.id = 'xinwei-control-panel';
    controlPanel.style.cssText = `
        position: fixed;
        top: 90px;
        right: 20px;
        width: 280px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        z-index: 999998;
        padding: 20px;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        border: 1px solid #e0e0e0;
    `;

    controlPanel.innerHTML = `
        <div style="margin-bottom: 15px;">
            <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px; font-weight: 600;">🎮 芯位教育助手</h3>
            <p style="margin: 0; color: #666; font-size: 12px;">控制自动播放和智能答题功能</p>
        </div>
        
        <!-- 选项卡切换 -->
        <div style="display: flex; margin-bottom: 15px; border-bottom: 2px solid #f0f0f0;">
            <div id="videoTab" class="xinwei-tab active" style="flex: 1; text-align: center; padding: 8px; cursor: pointer; border-bottom: 2px solid #667eea; margin-bottom: -2px;">
                <span style="font-size: 14px; font-weight: 500; color: #667eea;">📹 视频播放栏</span>
            </div>
            <div id="answerTab" class="xinwei-tab" style="flex: 1; text-align: center; padding: 8px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px;">
                <span style="font-size: 14px; font-weight: 500; color: #999;">🎯 智能答题栏</span>
            </div>
        </div>
        
        <!-- 视频播放栏内容 -->
        <div id="videoContent" class="xinwei-tab-content">
            <div style="margin-bottom: 15px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 8px 0;">
                    <div style="display: flex; align-items: center;">
                        <span style="color: #333; font-size: 14px; font-weight: 500; margin-left: 8px;">▶️ 自动下一个视频</span>
                    </div>
                    <label class="xinwei-switch">
                        <input type="checkbox" id="autoNextToggle">
                        <span class="xinwei-slider">
                            <span class="xinwei-slider-button"></span>
                        </span>
                    </label>
                </div>
                
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 8px 0;">
                    <div style="display: flex; align-items: center;">
                        <span style="color: #333; font-size: 14px; font-weight: 500; margin-left: 8px;">🔇 自动静音</span>
                    </div>
                    <label class="xinwei-switch">
                        <input type="checkbox" id="muteToggle">
                        <span class="xinwei-slider">
                            <span class="xinwei-slider-button"></span>
                        </span>
                    </label>
                </div>
                
                <div style="margin-bottom: 12px; padding: 8px 0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: #333; font-size: 14px; font-weight: 500;">⏯️ 播放控制</span>
                        <span id="progressTime" style="color: #666; font-size: 12px;">00:00 / 00:00</span>
                    </div>
                    <div class="xinwei-progress-container">
                        <div class="xinwei-progress-track">
                            <div class="xinwei-progress-fill" id="progressFill"></div>
                            <div class="xinwei-progress-thumb" id="progressThumb"></div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px;">
                        <button class="xinwei-btn xinwei-btn-small" id="playPauseBtn">⏸️ 暂停</button>
                        <button class="xinwei-btn xinwei-btn-small" id="speedBtn">1.0x</button>
                        <button class="xinwei-btn xinwei-btn-small" id="skipBtn">⏭️ 跳过</button>
                    </div>
                </div>
            </div>
            
            <div style="border-top: 1px solid #eee; padding-top: 15px;">
                <div style="font-size: 12px; color: #999; text-align: center;">
                    状态: <span id="statusText">运行中</span>
                </div>
            </div>
        </div>
        
        <!-- 智能答题栏内容 -->
        <div id="answerContent" class="xinwei-tab-content" style="display: none;">
            <div style="margin-bottom: 15px;">
                <!-- DeepSeek API Token 设置 -->
                <div style="margin-bottom: 12px; padding: 8px; background: #f0f7ff; border-radius: 8px;">
                    <div style="font-size: 12px; color: #666; margin-bottom: 6px;">🔑 DeepSeek API Token</div>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="deepseekToken" placeholder="输入DeepSeek API Token" 
                            style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px;">
                        <button class="xinwei-btn xinwei-btn-small" id="saveTokenBtn" style="min-width: 50px;">保存</button>
                    </div>
                    <div style="font-size: 11px; color: #999; margin-top: 4px;">
                        获取Token: <a href="https://platform.deepseek.com" target="_blank" style="color: #667eea;">DeepSeek官网</a>
                    </div>
                </div>
                
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 8px 0;">
                    <div style="display: flex; align-items: center;">
                        <span style="color: #333; font-size: 14px; font-weight: 500; margin-left: 8px;">🤖 DeepSeek AI答题</span>
                    </div>
                    <label class="xinwei-switch">
                        <input type="checkbox" id="aiAnswerToggle">
                        <span class="xinwei-slider">
                            <span class="xinwei-slider-button"></span>
                        </span>
                    </label>
                </div>
                
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 8px 0;">
                    <div style="display: flex; align-items: center;">
                        <span style="color: #333; font-size: 14px; font-weight: 500; margin-left: 8px;">🎲 随机答题（测试）</span>
                    </div>
                    <label class="xinwei-switch">
                        <input type="checkbox" id="randomAnswerToggle">
                        <span class="xinwei-slider">
                            <span class="xinwei-slider-button"></span>
                        </span>
                    </label>
                </div>
                
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 8px 0;">
                    <div style="display: flex; align-items: center;">
                        <span style="color: #333; font-size: 14px; font-weight: 500; margin-left: 8px;">📝 答完自动提交</span>
                    </div>
                    <label class="xinwei-switch">
                        <input type="checkbox" id="autoSubmitToggle">
                        <span class="xinwei-slider">
                            <span class="xinwei-slider-button"></span>
                        </span>
                    </label>
                </div>
                
                <div style="margin-bottom: 12px; padding: 8px;">
                    <div style="background: #f8f9fa; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                        <div style="font-size: 13px; color: #666; margin-bottom: 8px;">答题统计</div>
                        <div style="display: flex; justify-content: space-around; text-align: center;">
                            <div>
                                <div style="font-size: 20px; font-weight: 600; color: #667eea;" id="answeredCount">0</div>
                                <div style="font-size: 11px; color: #999;">已答题数</div>
                            </div>
                            <div>
                                <div style="font-size: 20px; font-weight: 600; color: #4CAF50;" id="totalCount">0</div>
                                <div style="font-size: 11px; color: #999;">总题数</div>
                            </div>
                        </div>
                    </div>
                    
                    <button class="xinwei-btn" id="aiAnswerBtn" style="width: 100%; margin-top: 8px; background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%);">
                        🤖 AI智能答题
                    </button>
                    <button class="xinwei-btn" id="randomAnswerBtn" style="width: 100%; margin-top: 8px;">
                        🎲 随机选择答案
                    </button>
                    <button class="xinwei-btn" id="nextQuestionBtn" style="width: 100%; margin-top: 8px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);">
                        ⏭️ 下一题
                    </button>
                    <button class="xinwei-btn" id="submitBtn" style="width: 100%; margin-top: 8px; background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);">
                        📤 提交作业
                    </button>
                </div>
            </div>
            
            <div style="border-top: 1px solid #eee; padding-top: 15px;">
                <div style="font-size: 12px; color: #999; text-align: center;">
                    答题状态: <span id="answerStatusText">未启动</span>
                </div>
            </div>
        </div>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        #xinwei-floating-window:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 25px rgba(0,0,0,0.4);
        }
        
        /* 现代化开关按钮样式 */
        .xinwei-switch {
            position: relative;
            display: inline-block;
            width: 56px;
            height: 28px;
            cursor: pointer;
        }
        
        .xinwei-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .xinwei-slider {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, #e0e0e0 0%, #c0c0c0 100%);
            border-radius: 28px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
            border: 1px solid rgba(0,0,0,0.1);
        }
        
        .xinwei-slider-button {
            position: absolute;
            height: 22px;
            width: 22px;
            left: 3px;
            bottom: 3px;
            background: linear-gradient(135deg, #ffffff 0%, #f8f8f8 100%);
            border-radius: 50%;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.1);
            border: 1px solid rgba(0,0,0,0.05);
        }
        
        .xinwei-switch input:checked + .xinwei-slider {
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 0 0 3px rgba(76, 175, 80, 0.2);
        }
        
        .xinwei-switch input:checked + .xinwei-slider .xinwei-slider-button {
            transform: translateX(28px);
            background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
            box-shadow: 0 2px 8px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.1);
        }
        
        .xinwei-switch:hover .xinwei-slider {
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 0 0 2px rgba(0,0,0,0.1);
        }
        
        .xinwei-switch:hover input:checked + .xinwei-slider {
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 0 0 3px rgba(76, 175, 80, 0.3);
        }
        
        .xinwei-switch:active .xinwei-slider-button {
            transform: scale(0.95);
        }
        
        .xinwei-switch input:checked:active + .xinwei-slider .xinwei-slider-button {
            transform: translateX(28px) scale(0.95);
        }
        
        /* 功能标签样式优化 */
        .xinwei-switch + div span {
            transition: color 0.2s ease;
        }
        
        .xinwei-switch input:checked ~ div span {
            color: #4CAF50;
        }
        
        /* 进度条样式 */
        .xinwei-progress-container {
            width: 100%;
            height: 20px;
            display: flex;
            align-items: center;
            margin: 8px 0;
        }
        
        .xinwei-progress-track {
            position: relative;
            width: 100%;
            height: 6px;
            background: linear-gradient(135deg, #e0e0e0 0%, #c0c0c0 100%);
            border-radius: 3px;
            cursor: pointer;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
        }
        
        .xinwei-progress-fill {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            border-radius: 3px;
            transition: width 0.1s ease;
            box-shadow: 0 1px 2px rgba(76, 175, 80, 0.3);
        }
        
        .xinwei-progress-thumb {
            position: absolute;
            top: 50%;
            left: 0%;
            width: 16px;
            height: 16px;
            background: linear-gradient(135deg, #ffffff 0%, #f8f8f8 100%);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            cursor: grab;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.1);
            border: 2px solid #4CAF50;
            transition: all 0.2s ease;
        }
        
        .xinwei-progress-thumb:hover {
            transform: translate(-50%, -50%) scale(1.2);
            box-shadow: 0 3px 8px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .xinwei-progress-thumb:active {
            cursor: grabbing;
            transform: translate(-50%, -50%) scale(1.1);
        }
        
        /* 控制按钮样式 */
        .xinwei-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            user-select: none;
        }
        
        .xinwei-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        
        .xinwei-btn:active {
            transform: translateY(0);
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        
        .xinwei-btn-small {
            padding: 4px 8px;
            font-size: 11px;
            min-width: 60px;
        }
        
        .xinwei-btn.active {
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
        }
        
        /* 选项卡样式 */
        .xinwei-tab {
            transition: all 0.3s ease;
        }
        
        .xinwei-tab:hover {
            background: #f8f9fa;
        }
        
        .xinwei-tab.active {
            border-bottom-color: #667eea !important;
        }
        
        .xinwei-tab.active span {
            color: #667eea !important;
        }
        
        .xinwei-tab-content {
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    document.head.appendChild(style);

    // 添加到页面
    document.body.appendChild(floatingWindow);
    document.body.appendChild(controlPanel);

    // 绑定事件
    floatingWindow.addEventListener('click', function() {
        const panel = document.getElementById('xinwei-control-panel');
        if (panel.style.display === 'none' || panel.style.display === '') {
            panel.style.display = 'block';
            floatingWindow.style.transform = 'scale(1.1)';
        } else {
            panel.style.display = 'none';
            floatingWindow.style.transform = 'scale(1)';
        }
    });

    // 绑定开关事件
    const autoNextToggle = document.getElementById('autoNextToggle');
    const muteToggle = document.getElementById('muteToggle');
    const statusText = document.getElementById('statusText');

    // 从localStorage加载设置
    autoNextEnabled = localStorage.getItem('xinwei-autoNext') !== 'false';
    muteEnabled = localStorage.getItem('xinwei-mute') !== 'false';

    autoNextToggle.checked = autoNextEnabled;
    muteToggle.checked = muteEnabled;

    autoNextToggle.addEventListener('change', function() {
        autoNextEnabled = this.checked;
        localStorage.setItem('xinwei-autoNext', autoNextEnabled);
        updateStatus();
    });

    muteToggle.addEventListener('change', function() {
        muteEnabled = this.checked;
        localStorage.setItem('xinwei-mute', muteEnabled);
        updateStatus();
    });

    // 更新状态显示
    function updateStatus() {
        const status = autoNextEnabled || muteEnabled ? '运行中' : '已暂停';
        statusText.textContent = status;
    }
    updateStatus();

    // 选项卡切换功能
    const videoTab = document.getElementById('videoTab');
    const answerTab = document.getElementById('answerTab');
    const videoContent = document.getElementById('videoContent');
    const answerContent = document.getElementById('answerContent');

    videoTab.addEventListener('click', function() {
        videoTab.classList.add('active');
        answerTab.classList.remove('active');
        videoTab.style.borderBottomColor = '#667eea';
        answerTab.style.borderBottomColor = 'transparent';
        videoTab.querySelector('span').style.color = '#667eea';
        answerTab.querySelector('span').style.color = '#999';
        videoContent.style.display = 'block';
        answerContent.style.display = 'none';
    });

    answerTab.addEventListener('click', function() {
        answerTab.classList.add('active');
        videoTab.classList.remove('active');
        answerTab.style.borderBottomColor = '#667eea';
        videoTab.style.borderBottomColor = 'transparent';
        answerTab.querySelector('span').style.color = '#667eea';
        videoTab.querySelector('span').style.color = '#999';
        answerContent.style.display = 'block';
        videoContent.style.display = 'none';
        
        // 更新答题统计
        updateAnswerStats();
    });

    // 点击外部关闭面板
    document.addEventListener('click', function(e) {
        if (!floatingWindow.contains(e.target) && !controlPanel.contains(e.target)) {
            controlPanel.style.display = 'none';
            floatingWindow.style.transform = 'scale(1)';
        }
    });

    // 初始化进度条控制功能
    initProgressControl();
    
    // 初始化智能答题功能
    initSmartAnswer();
}

// 进度条控制功能
function initProgressControl() {
    const progressTrack = document.querySelector('.xinwei-progress-track');
    const progressFill = document.getElementById('progressFill');
    const progressThumb = document.getElementById('progressThumb');
    const progressTime = document.getElementById('progressTime');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const speedBtn = document.getElementById('speedBtn');
    const skipBtn = document.getElementById('skipBtn');

    let isDragging = false;
    let currentVideo = null;
    let playbackSpeeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    let currentSpeedIndex = 2; // 默认1.0x

    // 查找当前视频元素
    function findCurrentVideo() {
        const videos = document.querySelectorAll('video');
        for (let video of videos) {
            if (!video.paused || video.currentTime > 0) {
                return video;
            }
        }
        return videos[0] || null;
    }

    // 更新进度条
    function updateProgress() {
        currentVideo = findCurrentVideo();
        if (!currentVideo) return;

        const progress = (currentVideo.currentTime / currentVideo.duration) * 100;
        progressFill.style.width = progress + '%';
        progressThumb.style.left = progress + '%';

        // 更新时间显示
        const currentTime = formatTime(currentVideo.currentTime);
        const duration = formatTime(currentVideo.duration);
        progressTime.textContent = `${currentTime} / ${duration}`;

        // 更新播放/暂停按钮
        if (currentVideo.paused) {
            playPauseBtn.textContent = '▶️ 播放';
            playPauseBtn.classList.remove('active');
        } else {
            playPauseBtn.textContent = '⏸️ 暂停';
            playPauseBtn.classList.add('active');
        }
    }

    // 格式化时间
    function formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // 设置视频进度
    function setVideoProgress(percent) {
        if (!currentVideo) return;
        const newTime = (percent / 100) * currentVideo.duration;
        currentVideo.currentTime = newTime;
    }

    // 进度条点击事件
    progressTrack.addEventListener('click', function(e) {
        if (isDragging) return;
        const rect = this.getBoundingClientRect();
        const percent = ((e.clientX - rect.left) / rect.width) * 100;
        setVideoProgress(Math.max(0, Math.min(100, percent)));
    });

    // 进度条拖拽事件
    progressThumb.addEventListener('mousedown', function(e) {
        isDragging = true;
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const rect = progressTrack.getBoundingClientRect();
        const percent = ((e.clientX - rect.left) / rect.width) * 100;
        const clampedPercent = Math.max(0, Math.min(100, percent));
        
        progressFill.style.width = clampedPercent + '%';
        progressThumb.style.left = clampedPercent + '%';
        
        if (currentVideo) {
            const newTime = (clampedPercent / 100) * currentVideo.duration;
            progressTime.textContent = `${formatTime(newTime)} / ${formatTime(currentVideo.duration)}`;
        }
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            const percent = parseFloat(progressThumb.style.left);
            setVideoProgress(percent);
        }
    });

    // 播放/暂停按钮
    playPauseBtn.addEventListener('click', function() {
        if (!currentVideo) return;
        if (currentVideo.paused) {
            currentVideo.play();
        } else {
            currentVideo.pause();
        }
    });

    // 倍速按钮
    speedBtn.addEventListener('click', function() {
        if (!currentVideo) return;
        currentSpeedIndex = (currentSpeedIndex + 1) % playbackSpeeds.length;
        const speed = playbackSpeeds[currentSpeedIndex];
        currentVideo.playbackRate = speed;
        speedBtn.textContent = speed + 'x';
        
        // 保存倍速设置
        localStorage.setItem('xinwei-playbackSpeed', speed);
    });

    // 跳过按钮
    skipBtn.addEventListener('click', function() {
        if (!currentVideo) return;
        // 跳过30秒
        currentVideo.currentTime += 30;
    });

    // 加载保存的倍速设置
    const savedSpeed = localStorage.getItem('xinwei-playbackSpeed');
    if (savedSpeed) {
        currentSpeedIndex = playbackSpeeds.indexOf(parseFloat(savedSpeed));
        if (currentSpeedIndex === -1) currentSpeedIndex = 2;
    }
    speedBtn.textContent = playbackSpeeds[currentSpeedIndex] + 'x';

    // 定期更新进度条
    setInterval(updateProgress, 1000);

    // 键盘快捷键
    document.addEventListener('keydown', function(e) {
        if (!currentVideo) return;
        
        switch(e.code) {
            case 'Space':
                e.preventDefault();
                if (currentVideo.paused) {
                    currentVideo.play();
                } else {
                    currentVideo.pause();
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                currentVideo.currentTime -= 10;
                break;
            case 'ArrowRight':
                e.preventDefault();
                currentVideo.currentTime += 10;
                break;
            case 'ArrowUp':
                e.preventDefault();
                currentSpeedIndex = (currentSpeedIndex + 1) % playbackSpeeds.length;
                const speed = playbackSpeeds[currentSpeedIndex];
                currentVideo.playbackRate = speed;
                speedBtn.textContent = speed + 'x';
                break;
            case 'ArrowDown':
                e.preventDefault();
                currentSpeedIndex = (currentSpeedIndex - 1 + playbackSpeeds.length) % playbackSpeeds.length;
                const speedDown = playbackSpeeds[currentSpeedIndex];
                currentVideo.playbackRate = speedDown;
                speedBtn.textContent = speedDown + 'x';
                break;
        }
    });
}

// 初始化悬浮窗
setTimeout(createFloatingWindow, 1000);

// 原有的主要功能代码
(function () {
    'use strict';
    const doc2 = document;
    const cscs = doc2.querySelector('body');
    let observer = new MutationObserver(handler);
    const options = { childList: true }
    observer.observe(cscs, options)
})();

// 修改定时器，根据开关状态执行功能
setInterval(function () {
    if (autoNextEnabled) {
        main();
    }
    if (muteEnabled) {
        mute();
    }
}, 1000);

function main() {
    // 原有的跳转逻辑
    var activeMenutrim = document.querySelector('#menu_tarr_content .courseware_menu_item.pull-left.ng-scope.active');

    if (activeMenutrim && activeMenutrim.innerText.trim() !== "") {
        console.log("老版界面");
        const activeMenu = document.querySelector('#menu_tarr_content .courseware_menu_item.pull-left.ng-scope.active').innerText;
        if (activeMenu === ' 文档' || activeMenu === ' 作业' || activeMenu === ' 问卷') {
            jumpToNext();
        } else if (document.querySelector('.layui-layer-title') !== null) {
            document.querySelectorAll('.layui-layer-btn0')[0].click();
        }
    } else {
        if (document.querySelector('.left') !== null) {
            var leftElements = document.querySelectorAll('.left');
            leftElements.forEach(function (element) {
                element.click();
            });
            console.log("新版界面");
        }
    }

}

// 添加MutationObserver监听，当DOM变化时重新启用控件
function handler(mutationRecordList) {
    if (autoNextEnabled) {
        main();
    }
    if (muteEnabled) {
        mute();
    }
}

function jumpToNext() {
    const courseChapterItems = document.querySelectorAll('.course_chapter_item.user-no-select.ng-scope');
    const activeItemText = document.querySelector('.course_chapter_item.user-no-select.ng-scope.active').innerText;
    for (let i = 0; i < courseChapterItems.length; i++) {
        if (activeItemText === courseChapterItems[i].innerText) {
            courseChapterItems[i + 1].children[1].click();
            break;
        }
    }
}

function mute() {
    // 方法1: 使用Chrome的自动播放策略和Web Audio API静音（受开关控制）
    try {
        // 重写AudioContext来静音所有Web Audio
        const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
        if (OriginalAudioContext && !window._xinweiAudioContextHooked) {
            window._xinweiAudioContextHooked = true;
            window.AudioContext = function(...args) {
                const context = new OriginalAudioContext(...args);

                if (muteEnabled) {
                    // 立即创建静音增益节点并连接到destination
                    const muteGain = context.createGain();
                    muteGain.gain.value = 0;
                    muteGain.connect(context.destination);

                    // 重写createGain方法
                    const originalCreateGain = context.createGain;
                    context.createGain = function() {
                        const gainNode = originalCreateGain.call(this);
                        if (muteEnabled) {
                            gainNode.gain.value = 0;
                        }
                        return gainNode;
                    };
                }

                return context;
            };
            window.AudioContext.prototype = OriginalAudioContext.prototype;
            if (window.webkitAudioContext) {
                window.webkitAudioContext = window.AudioContext;
            }
        }
    } catch (e) {
        console.log('AudioContext静音设置失败:', e);
    }

    // 方法2: 直接控制所有媒体元素 - 最有效的方法
    const mediaElements = document.querySelectorAll('video, audio');
    mediaElements.forEach(media => {
        try {
            // 强制设置属性
            media.muted = true;
            media.volume = 0;

            // 使用setAttribute确保属性被设置
            media.setAttribute('muted', 'true');
            media.setAttribute('volume', '0');

            // 拦截属性设置
            if (!media.__muteHooked) {
                media.__muteHooked = true;

                Object.defineProperty(media, 'volume', {
                    set: function(value) {
                        this._volume = 0;
                    },
                    get: function() {
                        return 0;
                    },
                    configurable: true
                });

                Object.defineProperty(media, 'muted', {
                    set: function(value) {
                        this._muted = true;
                    },
                    get: function() {
                        return true;
                    },
                    configurable: true
                });
            }
        } catch (err) {
            console.log('媒体元素静音失败:', err);
        }
    });

    // 方法3: 拦截HTMLMediaElement原型方法（受开关控制）
    try {
        if (!HTMLMediaElement.prototype._originalPlay) {
            HTMLMediaElement.prototype._originalPlay = HTMLMediaElement.prototype.play;
            HTMLMediaElement.prototype.play = function() {
                if (muteEnabled) {
                    this.muted = true;
                    this.volume = 0;
                }
                return HTMLMediaElement.prototype._originalPlay.call(this);
            };
        }

        if (!HTMLMediaElement.prototype._originalSetAttribute) {
            HTMLMediaElement.prototype._originalSetAttribute = HTMLMediaElement.prototype.setAttribute;
            HTMLMediaElement.prototype.setAttribute = function(name, value) {
                if (muteEnabled && (name === 'volume' || name === 'muted')) {
                    if (name === 'volume') value = '0';
                    if (name === 'muted') value = 'true';
                }
                return HTMLMediaElement.prototype._originalSetAttribute.call(this, name, value);
            };
        }
    } catch (e) {
        console.log('原型方法拦截失败:', e);
    }

    // 方法4: 使用Chrome的autoplay策略 - 设置页面为自动播放静音
    try {
        // 设置文档级自动播放策略
        if (document.body) {
            document.body.setAttribute('playsinline', 'true');
            document.body.setAttribute('muted', 'true');
        }

        // 设置视口的自动播放属性
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
            viewport.setAttribute('content', viewport.getAttribute('content') + ', user-scalable=no');
        }
    } catch (e) {
        // 忽略错误
    }

    // 方法5: 监听新创建的媒体元素
    if (!window.__muteObserver) {
        window.__muteObserver = new MutationObserver((mutations) => {
            if (muteEnabled) {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
                                muteElement(node);
                            }
                            // 检查子元素中的媒体元素
                            const mediaElements = node.querySelectorAll && node.querySelectorAll('video, audio');
                            if (mediaElements) {
                                mediaElements.forEach(muteElement);
                            }
                        }
                    });
                });
            }
        });

        window.__muteObserver.observe(document, {
            childList: true,
            subtree: true
        });
    }

    // 辅助函数：静音单个媒体元素
    function muteElement(element) {
        try {
            element.muted = true;
            element.volume = 0;
            element.setAttribute('muted', 'true');
            element.setAttribute('volume', '0');
        } catch (e) {
            console.log('静音元素失败:', e);
        }
    }

    // 方法6: 覆盖全局音频相关函数（针对第三方播放器）
    setTimeout(() => {
        // 针对video.js
        if (window.videojs) {
            const players = videojs.getPlayers();
            Object.values(players).forEach(player => {
                try {
                    player.muted(true);
                    player.volume(0);
                } catch (e) {}
            });
        }

        // 针对Howler.js
        if (window.Howl) {
            const OriginalHowl = window.Howl;
            window.Howl = function(options) {
                if (options) {
                    options.volume = 0;
                    options.mute = true;
                }
                const instance = new OriginalHowl(options);
                instance.volume(0);
                instance.mute(true);
                return instance;
            };
        }
    }, 100);

    console.log('Chrome标签页静音已应用');
}

// 添加更频繁的静音检查（针对动态加载的内容）
setInterval(() => {
    if (muteEnabled) {
        const mediaElements = document.querySelectorAll('video, audio');
        mediaElements.forEach(media => {
            if (!media.muted || media.volume > 0) {
                media.muted = true;
                media.volume = 0;
            }
        });
    }
}, 2000);

// ==================== 智能答题功能 ====================

// 随机答题功能控制
let randomAnswerEnabled = false;
let aiAnswerEnabled = false;
let autoSubmitEnabled = false;
let answerInterval = null;
let deepseekApiKey = '';

// DeepSeek API 配置
const DEEPSEEK_CONFIG = {
    API_URL: 'https://api.deepseek.com/v1/chat/completions',
    MODEL: 'deepseek-chat'
};

// 初始化智能答题功能
function initSmartAnswer() {
    const randomAnswerToggle = document.getElementById('randomAnswerToggle');
    const aiAnswerToggle = document.getElementById('aiAnswerToggle');
    const autoSubmitToggle = document.getElementById('autoSubmitToggle');
    const deepseekTokenInput = document.getElementById('deepseekToken');
    const saveTokenBtn = document.getElementById('saveTokenBtn');
    const aiAnswerBtn = document.getElementById('aiAnswerBtn');
    const randomAnswerBtn = document.getElementById('randomAnswerBtn');
    const nextQuestionBtn = document.getElementById('nextQuestionBtn');
    const submitBtn = document.getElementById('submitBtn');
    const answerStatusText = document.getElementById('answerStatusText');

    // 从localStorage加载设置
    randomAnswerEnabled = localStorage.getItem('xinwei-randomAnswer') === 'true';
    aiAnswerEnabled = localStorage.getItem('xinwei-aiAnswer') === 'true';
    autoSubmitEnabled = localStorage.getItem('xinwei-autoSubmit') === 'true';
    deepseekApiKey = localStorage.getItem('xinwei-deepseekToken') || '';
    
    randomAnswerToggle.checked = randomAnswerEnabled;
    aiAnswerToggle.checked = aiAnswerEnabled;
    autoSubmitToggle.checked = autoSubmitEnabled;
    deepseekTokenInput.value = deepseekApiKey;

    // 保存Token按钮
    saveTokenBtn.addEventListener('click', function() {
        const token = deepseekTokenInput.value.trim();
        if (token) {
            deepseekApiKey = token;
            localStorage.setItem('xinwei-deepseekToken', token);
            showAnswerTip('Token保存成功', 'success');
        } else {
            showAnswerTip('请输入有效的Token', 'warning');
        }
    });

    // AI答题开关
    aiAnswerToggle.addEventListener('change', function() {
        aiAnswerEnabled = this.checked;
        localStorage.setItem('xinwei-aiAnswer', aiAnswerEnabled);
        
        if (aiAnswerEnabled) {
            if (!deepseekApiKey) {
                showAnswerTip('请先配置DeepSeek API Token', 'warning');
                this.checked = false;
                aiAnswerEnabled = false;
                return;
            }
            // 关闭随机答题
            if (randomAnswerEnabled) {
                randomAnswerToggle.checked = false;
                randomAnswerEnabled = false;
                localStorage.setItem('xinwei-randomAnswer', 'false');
                stopAutoAnswer();
            }
            answerStatusText.textContent = 'AI答题中';
            answerStatusText.style.color = '#9C27B0';
            startAutoAnswer('ai');
        } else {
            answerStatusText.textContent = '已暂停';
            answerStatusText.style.color = '#ff9800';
            stopAutoAnswer();
        }
    });

    // 随机答题开关
    randomAnswerToggle.addEventListener('change', function() {
        randomAnswerEnabled = this.checked;
        localStorage.setItem('xinwei-randomAnswer', randomAnswerEnabled);
        
        if (randomAnswerEnabled) {
            // 关闭AI答题
            if (aiAnswerEnabled) {
                aiAnswerToggle.checked = false;
                aiAnswerEnabled = false;
                localStorage.setItem('xinwei-aiAnswer', 'false');
                stopAutoAnswer();
            }
            answerStatusText.textContent = '随机答题中';
            answerStatusText.style.color = '#4CAF50';
            startAutoAnswer('random');
        } else {
            answerStatusText.textContent = '已暂停';
            answerStatusText.style.color = '#ff9800';
            stopAutoAnswer();
        }
    });

    // 自动提交开关
    autoSubmitToggle.addEventListener('change', function() {
        autoSubmitEnabled = this.checked;
        localStorage.setItem('xinwei-autoSubmit', autoSubmitEnabled);
        
        if (autoSubmitEnabled) {
            showAnswerTip('已开启自动提交', 'success');
        } else {
            showAnswerTip('已关闭自动提交', 'info');
        }
    });

    // AI答题按钮
    aiAnswerBtn.addEventListener('click', async function() {
        if (!deepseekApiKey) {
            showAnswerTip('请先配置DeepSeek API Token', 'warning');
            return;
        }
        await aiSelectAnswer();
        updateAnswerStats();
    });

    // 随机选择答案按钮
    randomAnswerBtn.addEventListener('click', function() {
        randomSelectAnswer();
        updateAnswerStats();
    });

    // 下一题按钮
    nextQuestionBtn.addEventListener('click', function() {
        goToNextQuestion();
    });

    // 提交作业按钮
    submitBtn.addEventListener('click', function() {
        submitHomework();
    });

    // 如果已启用，开始自动答题
    if (randomAnswerEnabled) {
        answerStatusText.textContent = '随机答题中';
        answerStatusText.style.color = '#4CAF50';
        startAutoAnswer('random');
    } else if (aiAnswerEnabled) {
        if (deepseekApiKey) {
            answerStatusText.textContent = 'AI答题中';
            answerStatusText.style.color = '#9C27B0';
            startAutoAnswer('ai');
        } else {
            aiAnswerToggle.checked = false;
            aiAnswerEnabled = false;
            localStorage.setItem('xinwei-aiAnswer', 'false');
        }
    }
}

// 随机选择答案（单选题）
function randomSelectAnswer() {
    try {
        // 检查是否已经答过此题（随机模式通常不需要检查，但为了统一也可以加上）
        if (isQuestionAnswered()) {
            console.log('当前题目已答，跳过');
            showAnswerTip('已答题，跳过', 'info');
            return true;
        }

        // 检查是否在答题页面
        const radioGroup = document.querySelector('.el-radio-group');
        const checkboxGroup = document.querySelector('.el-checkbox-group');
        
        if (radioGroup) {
            // 单选题
            const radios = radioGroup.querySelectorAll('.el-radio');
            if (radios.length > 0) {
                const randomIndex = Math.floor(Math.random() * radios.length);
                const selectedRadio = radios[randomIndex];
                const radioInput = selectedRadio.querySelector('input[type="radio"]');
                
                if (radioInput) {
                    // 模拟点击选择
                    radioInput.click();
                    
                    // 获取选项文本
                    const optionText = selectedRadio.querySelector('.index-name')?.textContent || '';
                    console.log('已随机选择单选题答案:', optionText);
                    
                    // 显示提示
                    showAnswerTip(`已选择: ${optionText}`, 'success');
                    return true;
                }
            }
        } else if (checkboxGroup) {
            // 多选题
            const checkboxes = checkboxGroup.querySelectorAll('.el-checkbox');
            if (checkboxes.length > 0) {
                // 随机选择1-3个选项
                const numToSelect = Math.floor(Math.random() * Math.min(3, checkboxes.length)) + 1;
                const selectedIndexes = [];
                
                while (selectedIndexes.length < numToSelect) {
                    const randomIndex = Math.floor(Math.random() * checkboxes.length);
                    if (!selectedIndexes.includes(randomIndex)) {
                        selectedIndexes.push(randomIndex);
                    }
                }
                
                selectedIndexes.forEach(index => {
                    const checkbox = checkboxes[index];
                    const checkboxInput = checkbox.querySelector('input[type="checkbox"]');
                    if (checkboxInput && !checkboxInput.checked) {
                        checkboxInput.click();
                    }
                });
                
                console.log('已随机选择多选题答案，共选择', numToSelect, '个选项');
                showAnswerTip(`已选择 ${numToSelect} 个选项`, 'success');
                return true;
            }
        } else {
            console.log('未找到题目，可能不在答题页面');
            showAnswerTip('未找到题目', 'warning');
            return false;
        }
    } catch (error) {
        console.error('随机选择答案失败:', error);
        showAnswerTip('选择失败', 'error');
        return false;
    }
}

// 跳转到下一题
function goToNextQuestion() {
    try {
        // 查找下一题按钮
        const nextButtons = document.querySelectorAll('.toggle-button');
        let nextBtn = null;
        
        for (let btn of nextButtons) {
            if (btn.textContent.includes('下一题')) {
                nextBtn = btn;
                break;
            }
        }
        
        if (nextBtn && !nextBtn.disabled) {
            nextBtn.click();
            console.log('已跳转到下一题');
            showAnswerTip('下一题', 'info');
            
            // 延迟更新统计
            setTimeout(() => {
                updateAnswerStats();
            }, 500);
            
            return true;
        } else {
            console.log('没有下一题或已到最后一题');
            showAnswerTip('已是最后一题', 'warning');
            
            // 如果开启了自动提交，则提交作业
            if (autoSubmitEnabled) {
                setTimeout(() => {
                    submitHomework();
                }, 1000);
            }
            
            return false;
        }
    } catch (error) {
        console.error('跳转下一题失败:', error);
        return false;
    }
}

// 提交作业
function submitHomework() {
    try {
        // 查找提交作业按钮
        const submitButtons = document.querySelectorAll('.submit-button, button');
        let submitBtn = null;
        
        for (let btn of submitButtons) {
            const btnText = btn.textContent.trim();
            if (btnText.includes('提交作业') || btnText.includes('提交')) {
                submitBtn = btn;
                break;
            }
        }
        
        if (submitBtn && !submitBtn.disabled) {
            console.log('准备提交作业...');
            showAnswerTip('正在提交作业...', 'info');
            
            // 延迟点击，给用户反应时间
            setTimeout(() => {
                submitBtn.click();
                console.log('已点击提交作业按钮');
                
                // 处理可能出现的确认对话框
                setTimeout(() => {
                    handleSubmitConfirm();
                }, 500);
            }, 1000);
            
            return true;
        } else {
            console.log('未找到提交按钮或按钮已禁用');
            showAnswerTip('未找到提交按钮', 'warning');
            return false;
        }
    } catch (error) {
        console.error('提交作业失败:', error);
        showAnswerTip('提交失败', 'error');
        return false;
    }
}

// 处理提交确认对话框
function handleSubmitConfirm() {
    try {
        // 查找确认对话框中的确认按钮
        const confirmButtons = document.querySelectorAll('.el-button--primary, .el-message-box__btns button, button');
        
        for (let btn of confirmButtons) {
            const btnText = btn.textContent.trim();
            if (btnText.includes('确定') || btnText.includes('确认') || btnText === '是') {
                console.log('找到确认按钮，准备点击...');
                setTimeout(() => {
                    btn.click();
                    console.log('已确认提交');
                    showAnswerTip('作业已提交！', 'success');
                    
                    // 停止自动答题
                    if (randomAnswerEnabled) {
                        const toggle = document.getElementById('randomAnswerToggle');
                        if (toggle) {
                            toggle.checked = false;
                            toggle.dispatchEvent(new Event('change'));
                        }
                    }
                }, 200);
                return true;
            }
        }
        
        console.log('未找到确认对话框');
        return false;
    } catch (error) {
        console.error('处理确认对话框失败:', error);
        return false;
    }
}

// 更新答题统计
function updateAnswerStats() {
    try {
        const answeredCountElem = document.getElementById('answeredCount');
        const totalCountElem = document.getElementById('totalCount');
        
        // 查找答题卡中的题目列表
        const questionList = document.querySelectorAll('.select-box .list');
        const totalQuestions = questionList.length;
        
        // 统计已答题目（通过检查是否有特定样式或类名）
        let answeredCount = 0;
        questionList.forEach(item => {
            // 检查多种可能的已答标记
            if (item.classList.contains('answered') || 
                item.style.background || 
                item.style.backgroundColor ||
                item.classList.contains('active')) {
                answeredCount++;
            }
        });
        
        // 更新显示
        if (answeredCountElem) {
            answeredCountElem.textContent = answeredCount;
        }
        if (totalCountElem) {
            totalCountElem.textContent = totalQuestions;
        }
        
        console.log(`答题统计: ${answeredCount}/${totalQuestions}`);
        
        // 返回统计信息，供其他函数使用
        return {
            answered: answeredCount,
            total: totalQuestions,
            isComplete: answeredCount === totalQuestions && totalQuestions > 0
        };
    } catch (error) {
        console.error('更新答题统计失败:', error);
        return { answered: 0, total: 0, isComplete: false };
    }
}

// 显示答题提示
function showAnswerTip(message, type = 'info') {
    const tip = document.createElement('div');
    const colors = {
        success: '#4CAF50',
        error: '#f44336',
        warning: '#ff9800',
        info: '#2196F3'
    };
    
    tip.style.cssText = `
        position: fixed;
        top: 100px;
        right: 320px;
        background: ${colors[type] || colors.info};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
    `;
    
    tip.textContent = message;
    document.body.appendChild(tip);
    
    setTimeout(() => {
        tip.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (tip.parentNode) {
                tip.parentNode.removeChild(tip);
            }
        }, 300);
    }, 2000);
}

// 添加动画样式
const answerAnimStyle = document.createElement('style');
answerAnimStyle.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(50px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(50px);
        }
    }
`;
document.head.appendChild(answerAnimStyle);

// 检查当前题目是否已答
function isQuestionAnswered() {
    try {
        // 检查单选题
        const radioGroup = document.querySelector('.el-radio-group');
        if (radioGroup) {
            const checkedRadio = radioGroup.querySelector('input[type="radio"]:checked');
            if (checkedRadio) {
                return true;
            }
        }

        // 检查多选题
        const checkboxGroup = document.querySelector('.el-checkbox-group');
        if (checkboxGroup) {
            const checkedCheckbox = checkboxGroup.querySelector('input[type="checkbox"]:checked');
            if (checkedCheckbox) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('检查答题状态失败:', error);
        return false;
    }
}

// DeepSeek AI 智能答题
async function aiSelectAnswer() {
    try {
        if (!deepseekApiKey) {
            showAnswerTip('请先配置API Token', 'warning');
            return false;
        }

        // 检查是否已经答过此题
        if (isQuestionAnswered()) {
            console.log('当前题目已答，跳过');
            showAnswerTip('已答题，跳过', 'info');
            return true; // 返回true表示可以继续下一题
        }

        // 获取题目内容
        const questionData = getCurrentQuestion();
        if (!questionData) {
            showAnswerTip('未找到题目', 'warning');
            return false;
        }

        showAnswerTip('AI思考中...', 'info');

        // 构建提示词
        let prompt = `请分析以下题目并给出正确答案。只需要回答选项字母（如A、B、C、D），不要解释。\n\n`;
        prompt += `题目类型: ${questionData.type}\n`;
        prompt += `问题: ${questionData.question}\n\n`;
        prompt += `选项:\n`;
        questionData.options.forEach(opt => {
            prompt += `${opt.label}: ${opt.text}\n`;
        });
        
        if (questionData.type === '多选题') {
            prompt += `\n这是多选题，如果有多个正确答案，请用逗号分隔（如：A,C,D）`;
        }

        // 调用DeepSeek API
        const response = await fetch(DEEPSEEK_CONFIG.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${deepseekApiKey}`
            },
            body: JSON.stringify({
                model: DEEPSEEK_CONFIG.MODEL,
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 100
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const aiAnswer = result.choices[0].message.content.trim();
        
        console.log('AI答案:', aiAnswer);

        // 解析AI返回的答案并选择
        const success = selectAnswerByAI(aiAnswer, questionData.type);
        
        if (success) {
            showAnswerTip(`AI已选择: ${aiAnswer}`, 'success');
            return true;
        } else {
            showAnswerTip('AI答案解析失败', 'error');
            return false;
        }

    } catch (error) {
        console.error('AI答题失败:', error);
        showAnswerTip(`AI答题失败: ${error.message}`, 'error');
        return false;
    }
}

// 获取当前题目信息
function getCurrentQuestion() {
    try {
        // 获取题目类型
        const typeTag = document.querySelector('.tag');
        const questionType = typeTag ? typeTag.textContent.trim() : '';

        // 获取题目内容
        const questionElem = document.querySelector('.topic-title');
        const questionText = questionElem ? questionElem.textContent.trim() : '';

        if (!questionText) {
            return null;
        }

        // 获取选项
        const options = [];
        
        if (questionType === '单选题') {
            const radioGroup = document.querySelector('.el-radio-group');
            if (radioGroup) {
                const radios = radioGroup.querySelectorAll('.el-radio');
                radios.forEach(radio => {
                    const label = radio.querySelector('.index-name')?.textContent.trim() || '';
                    const text = radio.querySelector('.label')?.textContent.trim() || '';
                    options.push({ label, text });
                });
            }
        } else if (questionType === '多选题') {
            const checkboxGroup = document.querySelector('.el-checkbox-group');
            if (checkboxGroup) {
                const checkboxes = checkboxGroup.querySelectorAll('.el-checkbox');
                checkboxes.forEach(checkbox => {
                    const label = checkbox.querySelector('.index-name')?.textContent.trim() || '';
                    const text = checkbox.querySelector('.label')?.textContent.trim() || '';
                    options.push({ label, text });
                });
            }
        }

        return {
            type: questionType,
            question: questionText,
            options: options
        };

    } catch (error) {
        console.error('获取题目失败:', error);
        return null;
    }
}

// 根据AI答案选择选项
function selectAnswerByAI(aiAnswer, questionType) {
    try {
        // 提取答案中的字母（支持多种格式）
        const answerMatch = aiAnswer.match(/[A-Z]/gi);
        if (!answerMatch) {
            console.log('无法从AI答案中提取选项');
            return false;
        }

        const selectedOptions = answerMatch.map(s => s.toUpperCase());

        if (questionType === '单选题') {
            const radioGroup = document.querySelector('.el-radio-group');
            if (radioGroup) {
                const radios = radioGroup.querySelectorAll('.el-radio');
                for (let radio of radios) {
                    const label = radio.querySelector('.index-name')?.textContent.trim();
                    if (selectedOptions.includes(label)) {
                        const radioInput = radio.querySelector('input[type="radio"]');
                        if (radioInput) {
                            radioInput.click();
                            return true;
                        }
                    }
                }
            }
        } else if (questionType === '多选题') {
            const checkboxGroup = document.querySelector('.el-checkbox-group');
            if (checkboxGroup) {
                const checkboxes = checkboxGroup.querySelectorAll('.el-checkbox');
                let selectedCount = 0;
                
                checkboxes.forEach(checkbox => {
                    const label = checkbox.querySelector('.index-name')?.textContent.trim();
                    if (selectedOptions.includes(label)) {
                        const checkboxInput = checkbox.querySelector('input[type="checkbox"]');
                        if (checkboxInput && !checkboxInput.checked) {
                            checkboxInput.click();
                            selectedCount++;
                        }
                    }
                });
                
                return selectedCount > 0;
            }
        }

        return false;
    } catch (error) {
        console.error('选择答案失败:', error);
        return false;
    }
}

// 启动自动答题
function startAutoAnswer(mode = 'random') {
    if (answerInterval) {
        clearInterval(answerInterval);
    }
    
    answerInterval = setInterval(async () => {
        let success = false;
        
        // 更新答题统计
        const stats = updateAnswerStats();
        
        if (mode === 'ai' && aiAnswerEnabled) {
            // AI智能答题
            success = await aiSelectAnswer();
        } else if (mode === 'random' && randomAnswerEnabled) {
            // 随机答题
            success = randomSelectAnswer();
        }
        
        if (success) {
            // 随机延迟后跳转下一题（模拟人工操作）
            const delay = Math.random() * 2000 + 1000; // 1-3秒随机延迟
            setTimeout(() => {
                const hasNext = goToNextQuestion();
                
                // 如果没有下一题，可能已完成
                if (!hasNext) {
                    console.log('所有题目已完成');
                    // 更新最终统计
                    updateAnswerStats();
                }
            }, delay);
        } else {
            // 如果答题失败，尝试跳转下一题
            console.log('答题失败或已答过，尝试跳转下一题');
            setTimeout(() => {
                goToNextQuestion();
            }, 1000);
        }
    }, mode === 'ai' ? 6000 : 5000); // AI模式优化为6秒，已答题可快速跳过
}

// 停止自动答题
function stopAutoAnswer() {
    if (answerInterval) {
        clearInterval(answerInterval);
        answerInterval = null;
    }
}


