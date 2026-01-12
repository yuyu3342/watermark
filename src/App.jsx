import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Image as ImageIcon, X, Layers, Grid3X3, Bold, Italic, Type as TypeIcon, Blend, Plus, Trash2, CheckCircle2, Copy, Eye, EyeOff, Move, Palette, Sliders, Menu, Maximize, RotateCw, Check, PaintBucket, Sun, Loader2, Wand2, Eraser, ScanFace, Undo2, Brush } from 'lucide-react';

// --- 辅助配置 ---
const createLayer = (type = 'text', logoId = null) => ({
  id: Date.now() + Math.random().toString(),
  type, 
  visible: true,
  name: type === 'text' ? '文字水印' : 'Logo水印',
  blendMode: 'source-over', 
  opacity: 1, 
  rotation: 0,
  size: 150, 
  posX: 50,
  posY: 50,
  isTiled: false,
  tileDensity: 50,
  text: '@我的版权水印',
  textColor: '#ffffff',
  isBold: true,
  isItalic: false,
  strokeWidth: 0, 
  strokeColor: '#000000',
  logoId: logoId,
  hasBackground: false,
  backgroundColor: '#000000',
  backgroundPadding: 0,
  hasShadow: false 
});

// 几何算法
const getDistance = (p1, p2) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
const getAngle = (p1, p2) => Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
const getMidpoint = (p1, p2) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });

// 动态加载脚本
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
};

const App = () => {
  // --- 状态管理 ---
  const [imageList, setImageList] = useState([]); 
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set()); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  
  // 模式： 'watermark' (加水印) | 'eraser' (去水印)
  const [appMode, setAppMode] = useState('watermark'); 

  // 水印相关状态
  const [layers, setLayers] = useState([createLayer('text')]); 
  const [activeLayerId, setActiveLayerId] = useState(null); 
  const [activeTab, setActiveTab] = useState('content'); 
  const [activeOperation, setActiveOperation] = useState(''); 
  const [logoLibrary, setLogoLibrary] = useState([]); 

  // 去水印相关状态
  const [brushSize, setBrushSize] = useState(20);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [maskVersion, setMaskVersion] = useState(0); // 用于触发遮罩重绘
  const maskCanvasRef = useRef(null); // 存储红色的涂抹遮罩
  const modelRef = useRef(null); // 存储 AI 模型

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  
  const interactionRef = useRef({
    mode: 'idle', 
    startPointer: { x: 0, y: 0 }, 
    startVal: {}, 
    center: { x: 0, y: 0 },
    startDistance: 0,
    startAngle: 0,
    startMidpoint: { x: 0, y: 0 },
    lastDrawPoint: null // 绘画用
  });

  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];

  const BLEND_MODES = [
    { value: 'source-over', label: '正常' }, 
    { value: 'multiply', label: '正片叠底' },
    { value: 'screen', label: '滤色' },
    { value: 'overlay', label: '叠加' }, 
    { value: 'soft-light', label: '柔光' },
  ];

  // 初始化资源
  useEffect(() => {
    const initResources = async () => {
      // 1. Load JSZip
      if (!window.JSZip) {
          try {
            await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
          } catch(e) { console.error("JSZip loading failed"); }
      }

      // 2. Load AI Models (TensorFlow.js + BlazeFace)
      try {
        if (!window.tf) {
           await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.11.0/dist/tf.min.js");
        }
        if (!window.blazeface) {
           await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/dist/blazeface.min.js");
        }
        // 预加载模型
        if (window.blazeface && !modelRef.current) {
           // 确保 backend 加载
           if (window.tf) await window.tf.ready();
           modelRef.current = await window.blazeface.load();
           console.log("AI Model Loaded");
        }
      } catch (e) {
        console.error("AI Loading failed", e);
      }
    };
    initResources();
  }, []);

  useEffect(() => {
    if (layers.length > 0 && !activeLayerId) {
      setActiveLayerId(layers[0].id);
    }
  }, [layers, activeLayerId]);

  // --- 通用辅助 ---
  const updateLayer = (id, updates) => {
    setLayers(prev => prev.map(layer => layer.id === id ? { ...layer, ...updates } : layer));
  };
  
  const updateAllLayers = (updates) => {
    if(window.confirm("确定将当前设置应用到所有图层吗？")) {
       setLayers(prev => prev.map(layer => ({ ...layer, ...updates })));
    }
  };

  // --- 智能去水印/修复算法 (Inpainting) ---
  const applySmartRepair = async () => {
     if (!maskCanvasRef.current || imageList.length === 0) return;
     const currentImg = imageList[selectedIndex];
     if (!currentImg) return;

     setIsProcessing(true);
     setLoadingMsg("AI 正在修复底图...");

     await new Promise(r => setTimeout(r, 50));

     try {
       // 核心修复：创建一个临时的离屏 Canvas，只绘制底图
       // 这样可以避免把浮动的水印层也“修复”进图片里
       const tempCanvas = document.createElement('canvas');
       tempCanvas.width = currentImg.width;
       tempCanvas.height = currentImg.height;
       const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
       
       // 1. 只画底图！不画 Layers！
       ctx.drawImage(currentImg.imgObject, 0, 0);

       const width = tempCanvas.width;
       const height = tempCanvas.height;
       
       const maskCtx = maskCanvasRef.current.getContext('2d', { willReadFrequently: true });
       const imgData = ctx.getImageData(0, 0, width, height);
       const maskData = maskCtx.getImageData(0, 0, width, height); // 遮罩数据
       
       const data = imgData.data;
       const mData = maskData.data;
       
       // 简单的扩散算法 (Inpainting)
       const iterations = 30; 
       
       // 预计算遮罩索引
       const maskedIndices = [];
       for (let i = 0; i < data.length; i += 4) {
           if (mData[i] > 10) { // 红色通道有值
               maskedIndices.push(i);
           }
       }

       if (maskedIndices.length === 0) {
           setIsProcessing(false);
           setLoadingMsg("");
           alert("请先涂抹需要去除的区域");
           return;
       }

       for (let iter = 0; iter < iterations; iter++) {
           for (let k = 0; k < maskedIndices.length; k++) {
               const i = maskedIndices[k];
               
               let rSum = 0, gSum = 0, bSum = 0, count = 0;
               const w = width * 4;
               
               // 检查上下左右 8 个邻居
               const neighbors = [
                   i - 4, i + 4, // 左右
                   i - w, i + w, // 上下
                   i - w - 4, i - w + 4, // 上左 上右
                   i + w - 4, i + w + 4  // 下左 下右
               ];

               for (let n of neighbors) {
                   if (n >= 0 && n < data.length) {
                       rSum += data[n];
                       gSum += data[n + 1];
                       bSum += data[n + 2];
                       count++;
                   }
               }

               if (count > 0) {
                   data[i] = rSum / count;
                   data[i + 1] = gSum / count;
                   data[i + 2] = bSum / count;
               }
           }
       }

       // 更新 Temp Canvas
       ctx.putImageData(imgData, 0, 0);
       
       // 保存为新图片对象
       const newSrc = tempCanvas.toDataURL();
       const newImg = new Image();
       newImg.src = newSrc;
       newImg.onload = () => {
           const newList = [...imageList];
           newList[selectedIndex] = {
               ...newList[selectedIndex],
               src: newSrc,
               imgObject: newImg // 更新底图对象
           };
           setImageList(newList);
           clearMask(); 
           setIsProcessing(false);
           setLoadingMsg("");
       };

     } catch (err) {
         console.error(err);
         setIsProcessing(false);
         setLoadingMsg("");
         alert("修复出错，请重试");
     }
  };

  // --- AI 人脸识别 ---
  const detectFaces = async () => {
    const currentImg = imageList[selectedIndex];
    if (!modelRef.current || !currentImg || !maskCanvasRef.current) {
        if (!modelRef.current) alert("AI 模型正在加载中，请稍后...");
        return;
    }
    
    setIsAiLoading(true);
    try {
        // 核心修复：直接识别原始图片对象，而不是识别画了水印的 Canvas
        // 这样可以避免水印挡住脸导致识别失败，也可以避免识别到水印上的内容
        const predictions = await modelRef.current.estimateFaces(currentImg.imgObject, false);
        
        if (predictions.length > 0) {
            const ctx = maskCanvasRef.current.getContext('2d');
            ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            
            predictions.forEach(pred => {
                const start = pred.topLeft;
                const end = pred.bottomRight;
                const size = [end[0] - start[0], end[1] - start[1]];
                
                // 绘制椭圆覆盖人脸
                ctx.beginPath();
                const centerX = start[0] + size[0] / 2;
                const centerY = start[1] + size[1] / 2;
                const radiusX = (size[0] / 2) * 1.2;
                const radiusY = (size[1] / 2) * 1.2;
                
                ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
                ctx.fill();
            });
            setMaskVersion(v => v + 1); 
            setActiveOperation(`识别到 ${predictions.length} 张人脸`);
        } else {
            alert("未检测到人脸");
        }
    } catch (err) {
        console.error("Face detection error:", err);
        alert("识别失败，请确保图片清晰");
    } finally {
        setIsAiLoading(false);
    }
  };

  // --- 遮罩操作 ---
  const clearMask = () => {
      if (maskCanvasRef.current) {
          const ctx = maskCanvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
          setMaskVersion(v => v + 1);
      }
  };

  // --- 交互逻辑 ---
  // 处理绘图 (橡皮擦模式)
  const handleDrawStart = (x, y) => {
      if (!maskCanvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      
      const drawX = (x - rect.left) * scaleX;
      const drawY = (y - rect.top) * scaleY;
      
      interactionRef.current.lastDrawPoint = { x: drawX, y: drawY };
      
      const ctx = maskCanvasRef.current.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; 
      ctx.lineWidth = brushSize * scaleX; 
      
      ctx.beginPath();
      ctx.moveTo(drawX, drawY);
      ctx.lineTo(drawX, drawY); 
      ctx.stroke();
      setMaskVersion(v => v + 1);
  };

  const handleDrawMove = (x, y) => {
      if (!interactionRef.current.lastDrawPoint || !maskCanvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      
      const drawX = (x - rect.left) * scaleX;
      const drawY = (y - rect.top) * scaleY;
      
      const ctx = maskCanvasRef.current.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(interactionRef.current.lastDrawPoint.x, interactionRef.current.lastDrawPoint.y);
      ctx.lineTo(drawX, drawY);
      ctx.stroke();
      
      interactionRef.current.lastDrawPoint = { x: drawX, y: drawY };
      setMaskVersion(v => v + 1);
  };

  // 统一触摸处理
  const handleTouchStart = (e) => {
    if (!activeLayer || !canvasRef.current) return;
    
    // 修复：去水印模式下，完全禁止操作图层，只能绘图
    if (appMode === 'eraser') {
        const touch = e.touches[0];
        interactionRef.current.mode = 'drawing';
        handleDrawStart(touch.clientX, touch.clientY);
        return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    // --- 双指手势 ---
    if (e.touches.length === 2) {
        if (!activeLayer) return;
        const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        interactionRef.current = {
            mode: 'gesture',
            startDistance: getDistance(p1, p2),
            startAngle: getAngle(p1, p2),
            startMidpoint: getMidpoint(p1, p2),
            startVal: { size: activeLayer.size, rotation: activeLayer.rotation, posX: activeLayer.posX, posY: activeLayer.posY },
            canvasSize: { w: rect.width, h: rect.height }
        };
        setActiveOperation('双指调整');
        return;
    }

    // --- 单指操作 ---
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;
    const mx = (clientX - rect.left) * scaleX;
    const my = (clientY - rect.top) * scaleY;
    
    let hitActive = false;
    if (activeLayer) {
        const { cx, cy, w, h, rotation } = getLayerMetrics(activeLayer, canvasRef.current.width, canvasRef.current.height);
        const dx = mx - cx;
        const dy = my - cy;
        const lx = dx * Math.cos(-rotation) - dy * Math.sin(-rotation);
        const ly = dx * Math.sin(-rotation) + dy * Math.cos(-rotation);
        const handleRadius = Math.max(40, canvasRef.current.width * 0.08); 

        if (getDistance({x: lx, y: ly}, {x: 0, y: -h/2 - handleRadius}) < handleRadius * 1.5) {
            interactionRef.current = { mode: 'rotating', startPointer: { x: clientX, y: clientY }, startVal: { rotation: activeLayer.rotation }, center: { x: cx, y: cy } };
            setActiveOperation('旋转');
            hitActive = true;
        } 
        else if (getDistance({x: lx, y: ly}, {x: w/2, y: h/2}) < handleRadius * 1.5) {
            interactionRef.current = { mode: 'resizing', startPointer: { x: clientX, y: clientY }, startVal: { size: activeLayer.size }, center: { x: cx, y: cy } };
            setActiveOperation('缩放');
            hitActive = true;
        } 
        else if (lx >= -w/2 - 20 && lx <= w/2 + 20 && ly >= -h/2 - 20 && ly <= h/2 + 20) {
            interactionRef.current = { mode: 'moving', startPointer: { x: clientX, y: clientY }, startVal: { posX: activeLayer.posX, posY: activeLayer.posY }, canvasSize: { w: rect.width, h: rect.height } };
            setActiveOperation('移动');
            hitActive = true;
        }
    }

    if (!hitActive) {
        let found = false;
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            if (!layer.visible) continue;
            
            // 碰撞检测逻辑保持不变...
             const { cx: lcx, cy: lcy, w: lw, h: lh } = getLayerMetrics(layer, canvasRef.current.width, canvasRef.current.height);
             if (Math.abs(mx - lcx) < lw/2 && Math.abs(my - lcy) < lh/2) {
                 setActiveLayerId(layer.id);
                 found = true;
                 break;
             }
        }
        interactionRef.current.mode = 'idle';
    }
  };

  const handleTouchMove = (e) => {
    const { mode, startPointer, startVal, center, canvasSize, startDistance, startAngle, startMidpoint } = interactionRef.current;
    
    // 绘图模式优先
    if (mode === 'drawing') {
        const touch = e.touches[0];
        handleDrawMove(touch.clientX, touch.clientY);
        e.preventDefault(); // 防止滚动
        return;
    }

    if (mode === 'idle' || !activeLayer || !canvasRef.current) return;

    if (mode === 'gesture' && e.touches.length === 2) {
        const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        
        const newSize = Math.max(10, startVal.size * (getDistance(p1, p2) / startDistance));
        const newRotation = startVal.rotation + (getAngle(p1, p2) - startAngle);
        const curMid = getMidpoint(p1, p2);
        const percentX = startVal.posX + ((curMid.x - startMidpoint.x) / canvasSize.w) * 100;
        const percentY = startVal.posY + ((curMid.y - startMidpoint.y) / canvasSize.h) * 100;

        updateLayer(activeLayer.id, { size: newSize, rotation: newRotation, posX: percentX, posY: percentY });
        return;
    }

    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;

    if (mode === 'moving') {
        updateLayer(activeLayer.id, { 
            posX: startVal.posX + ((clientX - startPointer.x) / canvasSize.w) * 100, 
            posY: startVal.posY + ((clientY - startPointer.y) / canvasSize.h) * 100 
        });
    } else if (mode === 'rotating') {
        const rect = canvasRef.current.getBoundingClientRect();
        const screenCx = rect.left + (center.x / canvasRef.current.width) * rect.width;
        const screenCy = rect.top + (center.y / canvasRef.current.height) * rect.height;
        updateLayer(activeLayer.id, { rotation: Math.atan2(clientY - screenCy, clientX - screenCx) * 180 / Math.PI + 90 });
    } else if (mode === 'resizing') {
        const rect = canvasRef.current.getBoundingClientRect();
        const screenCx = rect.left + (center.x / canvasRef.current.width) * rect.width;
        const screenCy = rect.top + (center.y / canvasRef.current.height) * rect.height;
        const startDist = getDistance({x: screenCx, y: screenCy}, {x: startPointer.x, y: startPointer.y});
        if (startDist > 0) {
            const newSize = Math.max(10, startVal.size * (getDistance({x: screenCx, y: screenCy}, {x: clientX, y: clientY}) / startDist));
            updateLayer(activeLayer.id, { size: newSize });
        }
    }
  };

  const handlePointerUp = () => { interactionRef.current.mode = 'idle'; setActiveOperation(''); };
  
  // 鼠标兼容
  const handleMouseDown = (e) => {
      if(appMode === 'eraser') {
          interactionRef.current.mode = 'drawing';
          handleDrawStart(e.clientX, e.clientY);
      } else {
          handleTouchStart({ touches: [{ clientX: e.clientX, clientY: e.clientY }], preventDefault: ()=>{} });
      }
  };
  const handleMouseMove = (e) => { 
      if (e.buttons === 1) {
          if (appMode === 'eraser') handleDrawMove(e.clientX, e.clientY);
          else handleTouchMove({ touches: [{ clientX: e.clientX, clientY: e.clientY }], preventDefault: ()=>{} }); 
      }
  };

  // --- 核心：图层计算 ---
  const getLayerMetrics = useCallback((layer, canvasWidth, canvasHeight) => {
    let contentWidth = 0, contentHeight = 0;
    if (layer.type === 'text') {
        const fontSize = (canvasWidth * (layer.size / 1000)); 
        const textLen = layer.text.length;
        contentWidth = textLen * fontSize * (layer.text.match(/[\u4e00-\u9fa5]/) ? 1.1 : 0.65);
        contentHeight = fontSize;
    } else {
        const logoData = logoLibrary.find(l => l.id === layer.logoId);
        if (logoData) {
            const targetWidth = (canvasWidth * (layer.size / 1000));
            contentWidth = targetWidth;
            contentHeight = targetWidth * (logoData.imgObject.height / logoData.imgObject.width);
        } else { contentWidth = 100; contentHeight = 100; }
    }
    
    const padding = 20 + (layer.hasBackground ? 10 : 0); 
    return { 
        cx: (canvasWidth * layer.posX) / 100, 
        cy: (canvasHeight * layer.posY) / 100, 
        w: contentWidth + padding * 2, 
        h: contentHeight + padding * 2, 
        rotation: layer.rotation * Math.PI / 180 
    };
  }, [logoLibrary]);

  // --- 画布渲染 ---
  const renderSingleLayer = (ctx, width, height, layer, isSelected) => {
    let logoImg = null;
    if (layer.type === 'image') {
        const logoData = logoLibrary.find(l => l.id === layer.logoId);
        if (logoData) logoImg = logoData.imgObject; else return;
    }
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    
    let contentWidth, contentHeight;
    const fontSize = (width * (layer.size / 1000));
    
    if (layer.type === 'text') {
        ctx.font = `${layer.isItalic ? 'italic' : 'normal'} ${layer.isBold ? 'bold' : 'normal'} ${fontSize}px sans-serif`;
        ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        contentWidth = ctx.measureText(layer.text).width; contentHeight = fontSize;
    } else if (logoImg) {
        contentWidth = (width * (layer.size / 1000));
        contentHeight = contentWidth * (logoImg.height / logoImg.width);
    }

    const drawContent = () => {
        ctx.globalCompositeOperation = layer.blendMode;
        if (layer.hasBackground) {
            const pad = layer.backgroundPadding || 0; 
            ctx.fillStyle = layer.backgroundColor;
            ctx.fillRect(-contentWidth/2 - pad, -contentHeight/2 - pad, contentWidth + pad*2, contentHeight + pad*2);
        }
        if (layer.hasShadow && !layer.hasBackground) {
            ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = Math.max(2, layer.size/100); ctx.shadowOffsetX = Math.max(1, layer.size/200); ctx.shadowOffsetY = Math.max(1, layer.size/200); 
        } else ctx.shadowColor = "transparent";

        if (layer.type === 'text') {
            if (layer.strokeWidth > 0) { ctx.lineWidth = Math.max(1, (width * (layer.strokeWidth / 2000))); ctx.strokeStyle = layer.strokeColor; ctx.lineJoin = 'round'; ctx.strokeText(layer.text, 0, 0); }
            ctx.fillStyle = layer.textColor; ctx.fillText(layer.text, 0, 0);
        } else ctx.drawImage(logoImg, -contentWidth/2, -contentHeight/2, contentWidth, contentHeight);
    };

    if (layer.isTiled) {
        const gapX = contentWidth * 1.2 + (width * (layer.tileDensity / 300));
        const gapY = contentHeight * 1.2 + (width * (layer.tileDensity / 300));
        for (let x = -width*1.5; x < width * 2.5; x += gapX) {
            for (let y = -height*1.5; y < height * 2.5; y += gapY) {
                ctx.save(); ctx.translate(x, y); 
                if ((Math.floor(y / gapY) % 2) !== 0) ctx.translate(gapX / 2, 0);
                ctx.rotate(layer.rotation * Math.PI / 180); drawContent(); ctx.restore();
            }
        }
    } else {
        ctx.translate((width * layer.posX) / 100, (height * layer.posY) / 100);
        ctx.rotate(layer.rotation * Math.PI / 180);
        drawContent();
        // 关键修复：仅在加水印模式下绘制选中框，去水印模式下不显示，避免视觉干扰
        if (isSelected && appMode === 'watermark') { 
            ctx.globalCompositeOperation = 'source-over'; ctx.shadowColor = 'transparent'; ctx.globalAlpha = 1.0;
            const pad = 20, boxW = contentWidth + pad * 2, boxH = contentHeight + pad * 2;
            const handleR = Math.max(20, width * 0.04);
            ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = Math.max(3, width * 0.005); 
            ctx.setLineDash([15, 10]); ctx.strokeRect(-boxW/2, -boxH/2, boxW, boxH); ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(0, -boxH/2); ctx.lineTo(0, -boxH/2 - handleR); ctx.stroke();
            const drawHandle = (cx, cy, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, handleR, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); };
            drawHandle(0, -boxH/2 - handleR, '#10b981'); drawHandle(boxW/2, boxH/2, '#3b82f6');    
        }
    }
    ctx.restore();
  };

  // 主渲染 Loop
  useEffect(() => {
    const imgData = imageList[selectedIndex];
    if (!imgData || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d', { colorSpace: 'display-p3' });
    canvasRef.current.width = imgData.width; canvasRef.current.height = imgData.height;
    
    // 1. 绘制底图 (如果刚刚修复过，imgData.src 已经是修复后的了)
    ctx.drawImage(imgData.imgObject, 0, 0);
    
    // 2. 绘制水印 
    // 注意：去水印模式下，我们仍然显示水印图层以便用户查看整体效果，但不会被修复功能读取
    layers.forEach(l => l.visible && renderSingleLayer(ctx, imgData.width, imgData.height, l, l.id === activeLayerId));
    
    // 3. 如果是去水印模式，初始化或同步遮罩层大小
    if (maskCanvasRef.current) {
        if (maskCanvasRef.current.width !== imgData.width || maskCanvasRef.current.height !== imgData.height) {
            maskCanvasRef.current.width = imgData.width;
            maskCanvasRef.current.height = imgData.height;
        }
    }
  }, [imageList, selectedIndex, layers, activeLayerId, logoLibrary, appMode]);

  // ... (其余辅助函数保持不变，如 addLayer, removeLayer 等)
  const addLayer = (type, logoId = null) => {
    const newLayer = createLayer(type, logoId);
    newLayer.posX = 50 + (layers.length * 2); 
    newLayer.posY = 50 + (layers.length * 2);
    setLayers([...layers, newLayer]);
    setActiveLayerId(newLayer.id);
    setActiveTab('content'); 
  };
  const removeLayer = (id, e) => { e?.stopPropagation(); if (layers.length <= 1) return alert("至少保留一个图层"); const newLayers = layers.filter(l => l.id !== id); setLayers(newLayers); if (activeLayerId === id) setActiveLayerId(newLayers[newLayers.length - 1].id); };
  const duplicateLayer = (id, e) => { e?.stopPropagation(); const layerToCopy = layers.find(l => l.id === id); if (!layerToCopy) return; const newLayer = { ...layerToCopy, id: Date.now() + Math.random().toString(), name: layerToCopy.name + " (复制)", posX: layerToCopy.posX + 5, posY: layerToCopy.posY + 5 }; setLayers([...layers, newLayer]); setActiveLayerId(newLayer.id); };
  const deleteLogo = (id, e) => { e.stopPropagation(); if(window.confirm("确定删除这个图片素材吗？")) { setLogoLibrary(prev => prev.filter(logo => logo.id !== id)); } };
  const handleFillCanvas = () => { if (!activeLayer || !canvasRef.current) return; const canvas = canvasRef.current; const canvasRatio = canvas.width / canvas.height; let newSize = activeLayer.type === 'text' ? 1500 : 1000; updateLayer(activeLayer.id, { size: Math.ceil(newSize * 1.1), posX: 50, posY: 50, rotation: 0, isTiled: false, opacity: 1 }); setActiveOperation('已铺满'); setTimeout(() => setActiveOperation(''), 1000); };
  const handleImageUpload = (e) => { const files = Array.from(e.target.files); if (files.length === 0) return; files.forEach((file) => { const reader = new FileReader(); reader.onload = (event) => { const img = new Image(); img.onload = () => { setImageList(prev => [...prev, { id: Date.now() + Math.random(), src: event.target.result, file, imgObject: img, width: img.width, height: img.height }]); if (imageList.length === 0) setSelectedIndex(0); }; img.src = event.target.result; }; reader.readAsDataURL(file); }); e.target.value = ''; };
  const handleLogoUpload = (e) => { const files = Array.from(e.target.files); if (files.length === 0) return; files.forEach(file => { const reader = new FileReader(); reader.onload = (event) => { const img = new Image(); img.onload = () => { const newLogo = { id: Date.now() + Math.random(), src: event.target.result, imgObject: img, name: file.name }; setLogoLibrary(prev => [...prev, newLogo]); addLayer('image', newLogo.id); }; img.src = event.target.result; }; reader.readAsDataURL(file); }); if (logoInputRef.current) logoInputRef.current.value = ''; };
  const removeImage = (index, e) => { e.stopPropagation(); if(!window.confirm("移除这张底图？")) return; const imageToRemove = imageList[index]; const newList = imageList.filter((_, i) => i !== index); setImageList(newList); if (selectedIds.has(imageToRemove.id)) { const newIds = new Set(selectedIds); newIds.delete(imageToRemove.id); setSelectedIds(newIds); } if (index === selectedIndex) setSelectedIndex(Math.max(0, index - 1)); };
  const selectAll = () => { setSelectedIds(selectedIds.size === imageList.length ? new Set() : new Set(imageList.map(img => img.id))); };
  
  const handleDownload = async () => {
    if (!canvasRef.current || imageList.length === 0) return;
    if (!window.JSZip) return alert("组件正在初始化，请稍等...");
    try {
      setIsProcessing(true);
      setLoadingMsg("正在打包导出...");
      const zip = new window.JSZip(); const folder = zip.folder("watermarked");
      const tempCanvas = document.createElement('canvas'); const ctx = tempCanvas.getContext('2d', { colorSpace: 'display-p3' });
      for (let i = 0; i < imageList.length; i++) {
          const img = imageList[i];
          if (selectedIds.size > 0 && !selectedIds.has(img.id)) continue;
          tempCanvas.width = img.width; tempCanvas.height = img.height;
          // 注意：导出时我们使用当前的 img.imgObject，如果已经在去水印模式下修改过，这里导出的就是干净的图
          ctx.drawImage(img.imgObject, 0, 0);
          // 如果在加水印模式，或者是为了导出带水印的图，则绘制图层
          // 这里逻辑：用户想要的是当前看到的效果
          layers.forEach(l => l.visible && renderSingleLayer(ctx, img.width, img.height, l, false));
          const blob = await new Promise(r => tempCanvas.toBlob(r, 'image/jpeg', 1.0));
          if (blob) folder.file(`wm_${img.file.name}`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a'); link.href = URL.createObjectURL(content); link.download = "images.zip"; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) { console.error("导出失败:", error); alert("导出错误"); } finally { setIsProcessing(false); setLoadingMsg(""); }
  };

  const renderInputs = () => (
    <>
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />
      <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" multiple className="hidden" />
    </>
  );

  const SyncButton = ({ prop, val }) => ( <button onClick={() => updateAllLayers({ [prop]: val })} className="text-gray-500 hover:text-blue-400 p-2"><Copy size={16} /></button> );

  if (imageList.length === 0) return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-6 rounded-3xl mb-8 shadow-xl"><Layers size={64}/></div>
        <h1 className="text-3xl font-bold mb-4">水印大师 AI版</h1>
        <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 px-8 py-4 rounded-xl font-bold flex gap-2"><Upload/> 选择照片</button>
        {renderInputs()}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black flex flex-col text-white touch-none select-none">
        {/* Loading Overlay */}
        {isProcessing && (
            <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center">
                <Loader2 size={48} className="animate-spin text-blue-500 mb-4"/>
                <span className="font-bold">{loadingMsg}</span>
            </div>
        )}

        <div className="h-14 bg-[#18181b] flex items-center justify-between px-4 z-20">
            <div className="flex gap-3 items-center">
                <span className="font-bold text-blue-400">{selectedIndex + 1} / {imageList.length}</span>
                <button onClick={selectAll} className="p-2 bg-gray-800 rounded-full"><CheckCircle2 size={18}/></button>
            </div>
            
            <div className="flex bg-gray-800 rounded-lg p-1">
                <button onClick={() => setAppMode('watermark')} className={`px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1 ${appMode==='watermark' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>
                    <Layers size={14}/> 加水印
                </button>
                <button onClick={() => setAppMode('eraser')} className={`px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1 ${appMode==='eraser' ? 'bg-rose-600 text-white' : 'text-gray-400'}`}>
                    <Eraser size={14}/> 去水印
                </button>
            </div>

            <button onClick={handleDownload} className="px-4 py-1.5 rounded-full text-sm font-bold flex gap-2 bg-blue-600 text-white">
                <Download size={16}/> 导出
            </button>
        </div>

        <div className="flex-1 relative bg-[#09090b] flex items-center justify-center overflow-hidden"
             onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handlePointerUp} onTouchCancel={handlePointerUp}
             onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}>
            {activeOperation && <div className="absolute top-4 bg-black/60 px-4 py-1 rounded-full text-sm z-30 pointer-events-none border border-white/10">{activeOperation}</div>}
            
            {/* 主画布 */}
            <canvas ref={canvasRef} className="max-w-[95%] max-h-[95%] object-contain shadow-2xl z-10"/>
            
            {/* 遮罩画布 (仅在去水印模式显示) */}
            <canvas 
                ref={maskCanvasRef} 
                className={`absolute inset-0 pointer-events-none z-20 transition-opacity duration-200 ${appMode === 'eraser' ? 'opacity-100' : 'opacity-0'}`}
                style={{ 
                    width: canvasRef.current?.style.width, 
                    height: canvasRef.current?.style.height,
                    maxWidth: '95%',
                    maxHeight: '95%',
                    aspectRatio: canvasRef.current ? `${canvasRef.current.width}/${canvasRef.current.height}` : 'auto'
                }}
            />
        </div>

        <div className="h-20 bg-[#121214] flex items-center px-2 gap-3 overflow-x-auto z-20">
            <button onClick={() => fileInputRef.current?.click()} className="w-14 h-14 rounded-xl border border-dashed border-gray-600 flex flex-col items-center justify-center text-gray-500 flex-shrink-0"><Plus size={20}/><span className="text-[10px]">加图</span></button>
            {imageList.map((img, i) => (
                <div key={img.id} onClick={() => setSelectedIndex(i)} className={`w-14 h-14 rounded-xl overflow-hidden border-2 flex-shrink-0 relative ${i === selectedIndex ? 'border-blue-500' : 'border-transparent opacity-60'}`}>
                    <img src={img.src} className="w-full h-full object-cover"/>
                    {selectedIds.has(img.id) && <div className="absolute inset-0 bg-blue-500/30 flex items-center justify-center"><Check size={16}/></div>}
                    <button onClick={(e) => removeImage(i, e)} className="absolute top-0 right-0 bg-red-600 text-white w-5 h-5 flex items-center justify-center rounded-bl-lg"><X size={12}/></button>
                </div>
            ))}
        </div>

        <div className="bg-[#18181b] pb-safe-area z-20">
            {appMode === 'watermark' ? (
                <>
                    <div className="flex">
                        {['layers', 'content', 'style'].map(t => (
                            <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-3 text-xs font-bold flex flex-col items-center gap-1 ${activeTab === t ? 'text-blue-400' : 'text-gray-500'}`}>
                                {t === 'layers' && <Layers size={20}/>}{t === 'content' && <TypeIcon size={20}/>}{t === 'style' && <Sliders size={20}/>}
                                {t === 'layers' ? '图层' : t === 'content' ? '内容' : '样式'}
                            </button>
                        ))}
                    </div>
                    <div className="h-56 overflow-y-auto px-4 py-2 bg-[#121214]">
                        {activeTab === 'layers' && (
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <button onClick={() => addLayer('text')} className="flex-1 bg-gray-800 py-2 rounded text-xs font-bold">+ 文字</button>
                                    <button onClick={() => logoInputRef.current?.click()} className="flex-1 bg-gray-800 py-2 rounded text-xs font-bold">+ 图片</button>
                                </div>
                                {layers.slice().reverse().map(l => (
                                    <div key={l.id} onClick={() => setActiveLayerId(l.id)} className={`flex items-center p-2 rounded border ${l.id === activeLayerId ? 'border-blue-500 bg-blue-900/10' : 'border-gray-700'}`}>
                                        <span className="flex-1 text-xs truncate">{l.type === 'image' ? (logoLibrary.find(lg=>lg.id===l.logoId)?.name || 'Image') : l.text}</span>
                                        <button onClick={(e) => {e.stopPropagation(); updateLayer(l.id, {visible: !l.visible})}} className="p-2 text-gray-400">{l.visible?<Eye size={14}/>:<EyeOff size={14}/>}</button>
                                        <button onClick={(e) => duplicateLayer(l.id, e)} className="p-2 text-gray-400"><Copy size={14}/></button>
                                        <button onClick={(e) => removeLayer(l.id, e)} className="p-2 text-red-400"><Trash2 size={14}/></button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {activeTab === 'content' && activeLayer && (
                            <div className="space-y-4">
                                {/* ... existing Content tab UI ... */}
                                <div className="flex items-center justify-between bg-gray-800 p-2 rounded-lg border border-gray-700">
                                    <div className="flex items-center gap-2"><PaintBucket size={16} className="text-gray-400"/><span className="text-xs text-gray-300 font-bold">背景底板</span></div>
                                    <div className="flex items-center gap-3">
                                        {activeLayer.hasBackground && <input type="color" value={activeLayer.backgroundColor} onChange={e => updateLayer(activeLayer.id, {backgroundColor: e.target.value})} className="w-6 h-6 rounded border-none bg-transparent"/>}
                                        <button onClick={() => updateLayer(activeLayer.id, {hasBackground: !activeLayer.hasBackground})} className={`w-10 h-5 rounded-full relative transition-colors ${activeLayer.hasBackground ? 'bg-green-500' : 'bg-gray-600'}`}><span className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${activeLayer.hasBackground ? 'translate-x-5' : ''}`}/></button>
                                    </div>
                                </div>
                                {activeLayer.type === 'text' ? (
                                    <>
                                        <input type="text" value={activeLayer.text} onChange={e => updateLayer(activeLayer.id, {text: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none"/>
                                        <div className="flex gap-2">
                                            <div className="flex items-center gap-2 bg-gray-800 p-2 rounded border border-gray-700 flex-1"><input type="color" value={activeLayer.textColor} onChange={e => updateLayer(activeLayer.id, {textColor: e.target.value})} className="w-6 h-6 bg-transparent border-none"/><span className="text-xs text-gray-400">{activeLayer.textColor}</span></div>
                                            <button onClick={()=>updateLayer(activeLayer.id, {isBold: !activeLayer.isBold})} className={`p-2 rounded border ${activeLayer.isBold ? 'bg-blue-600 border-blue-600' : 'border-gray-700'}`}><Bold size={16}/></button>
                                            <button onClick={()=>updateLayer(activeLayer.id, {isItalic: !activeLayer.isItalic})} className={`p-2 rounded border ${activeLayer.isItalic ? 'bg-blue-600 border-blue-600' : 'border-gray-700'}`}><Italic size={16}/></button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="grid grid-cols-4 gap-2">
                                        {logoLibrary.map(l => (
                                            <div key={l.id} onClick={() => updateLayer(activeLayer.id, {logoId: l.id})} className={`aspect-square border rounded p-1 relative ${activeLayer.logoId === l.id ? 'border-blue-500' : 'border-gray-700'}`}><img src={l.src} className="w-full h-full object-contain"/><button onClick={(e) => deleteLogo(l.id, e)} className="absolute top-0 right-0 bg-red-600 text-white w-4 h-4 flex items-center justify-center rounded-bl"><X size={10}/></button></div>
                                        ))}
                                        <button onClick={() => logoInputRef.current?.click()} className="border border-dashed border-gray-600 rounded flex items-center justify-center text-gray-500"><Plus size={20}/></button>
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">{BLEND_MODES.slice(0,5).map(m => (<button key={m.value} onClick={() => updateLayer(activeLayer.id, {blendMode: m.value})} className={`px-2 py-1 text-xs rounded border ${activeLayer.blendMode === m.value ? 'bg-blue-600 border-blue-600' : 'border-gray-700 text-gray-400'}`}>{m.label}</button>))}</div>
                                <button onClick={(e) => removeLayer(activeLayer.id, e)} className="w-full py-2 mt-2 bg-red-900/30 text-red-400 border border-red-900/50 rounded-lg text-sm font-bold flex items-center justify-center gap-2"><Trash2 size={16} /> 删除当前图层</button>
                            </div>
                        )}
                        {activeTab === 'style' && activeLayer && (
                            <div className="space-y-4">
                                {/* ... existing Style tab UI ... */}
                                <div className="space-y-1"><div className="flex justify-between items-center"><span className="text-xs text-gray-400">大小</span><div className="flex gap-2"><button onClick={handleFillCanvas} className="text-[10px] bg-blue-900/30 text-blue-400 border border-blue-800 px-2 py-0.5 rounded flex items-center gap-1 active:bg-blue-800"><Maximize size={10} /> 一键铺满</button><SyncButton prop="size" val={activeLayer.size}/></div></div><input type="range" min="10" max="10000" step="1" value={activeLayer.size} onChange={e => updateLayer(activeLayer.id, {size: Number(e.target.value)})} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/></div>
                                {['opacity', 'rotation'].map(k => (<div key={k} className="space-y-1"><div className="flex justify-between"><span className="text-xs text-gray-400 capitalize">{k}</span><SyncButton prop={k} val={activeLayer[k]}/></div><input type="range" min={k === 'opacity' ? 0 : 0} max={k === 'opacity' ? 1 : 360} step={k === 'opacity' ? 0.01 : 1} value={activeLayer[k]} onChange={e => updateLayer(activeLayer.id, {[k]: Number(e.target.value)})} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/></div>))}
                                <div className="flex items-center justify-between border-t border-gray-700 pt-2"><div className="flex items-center gap-2"><Sun size={14} className="text-gray-400"/><span className="text-xs text-gray-400">投影</span></div><button onClick={() => updateLayer(activeLayer.id, {hasShadow: !activeLayer.hasShadow})} className={`w-10 h-5 rounded-full relative transition-colors ${activeLayer.hasShadow ? 'bg-blue-600' : 'bg-gray-600'}`}><span className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${activeLayer.hasShadow ? 'translate-x-5' : ''}`}/></button></div>
                                <div className="flex items-center justify-between border-t border-gray-700 pt-2"><span className="text-xs text-gray-400">平铺模式</span><button onClick={() => updateLayer(activeLayer.id, {isTiled: !activeLayer.isTiled})} className={`w-10 h-6 rounded-full relative transition-colors ${activeLayer.isTiled ? 'bg-blue-600' : 'bg-gray-700'}`}><span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${activeLayer.isTiled ? 'translate-x-4' : ''}`}/></button></div>
                                {activeLayer.isTiled && (<div className="space-y-1"><div className="flex justify-between"><span className="text-xs text-gray-400">密度</span><SyncButton prop="tileDensity" val={activeLayer.tileDensity}/></div><input type="range" min="10" max="150" value={activeLayer.tileDensity} onChange={e => updateLayer(activeLayer.id, {tileDensity: Number(e.target.value)})} className="w-full h-1 bg-gray-700 rounded-lg appearance-none accent-blue-500"/></div>)}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                // --- 去水印工具栏 ---
                <div className="h-56 p-4 bg-[#121214] flex flex-col gap-4">
                    <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                         <span className="font-bold text-sm text-gray-300 flex items-center gap-2"><Wand2 size={16}/> 智能消除</span>
                         <span className="text-xs text-gray-500">涂抹或识别需要消除的区域</span>
                    </div>

                    <div className="flex gap-2">
                        <button 
                            onClick={detectFaces} 
                            disabled={isAiLoading}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 py-3 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-50"
                        >
                            {isAiLoading ? <Loader2 size={20} className="animate-spin"/> : <ScanFace size={20}/>}
                            <span className="text-xs font-bold">AI 识别脸部</span>
                        </button>
                        
                        <button 
                            onClick={clearMask} 
                            className="flex-1 bg-gray-800 hover:bg-gray-700 py-3 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors"
                        >
                            <Undo2 size={20}/>
                            <span className="text-xs font-bold">清除涂抹</span>
                        </button>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-gray-400">
                            <span>橡皮擦大小</span>
                            <span>{brushSize}px</span>
                        </div>
                        <input 
                            type="range" min="5" max="100" value={brushSize} 
                            onChange={(e) => setBrushSize(Number(e.target.value))} 
                            className="w-full h-1 bg-gray-700 rounded-lg appearance-none accent-rose-500"
                        />
                    </div>

                    <button 
                        onClick={applySmartRepair} 
                        className="w-full bg-rose-600 hover:bg-rose-700 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg shadow-rose-900/20"
                    >
                        <Wand2 size={18}/> 开始消除 (Inpaint)
                    </button>
                </div>
            )}
        </div>
        {renderInputs()}
        <style>{`.pb-safe-area{padding-bottom:env(safe-area-inset-bottom)}`}</style>
    </div>
  );
};

export default App;