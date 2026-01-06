import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Image as ImageIcon, X, Layers, Grid3X3, Bold, Italic, Type as TypeIcon, Blend, Plus, Trash2, CheckCircle2, Copy, Eye, EyeOff, Move, Palette, Sliders, Menu, Maximize2, RotateCw, Check } from 'lucide-react';

// --- 辅助函数：创建新图层 ---
const createLayer = (type = 'text', logoId = null) => ({
  id: Date.now() + Math.random().toString(),
  type, // 'text' | 'image'
  visible: true,
  name: type === 'text' ? '文字水印' : 'Logo水印',
  
  // 通用属性
  blendMode: 'source-over',
  opacity: 0.8,
  rotation: 0,
  size: 150, // 基准大小
  posX: 50,
  posY: 50,
  isTiled: false,
  tileDensity: 50,
  
  // 文字属性
  text: '@我的版权水印',
  textColor: '#ffffff',
  isBold: true,
  isItalic: false,
  strokeWidth: 2,
  strokeColor: '#000000',
  
  // 图片属性
  logoId: logoId
});

// --- 几何计算辅助函数 ---
const getDistance = (p1, p2) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
const getAngle = (p1, p2) => Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
const getMidpoint = (p1, p2) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });

const WatermarkApp = () => {
  // --- 核心状态 ---
  const [imageList, setImageList] = useState([]); 
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set()); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isZipLoaded, setIsZipLoaded] = useState(false);

  // --- 多图层状态 ---
  const [layers, setLayers] = useState([createLayer('text')]); 
  const [activeLayerId, setActiveLayerId] = useState(null); 

  // --- UI 状态 ---
  const [activeTab, setActiveTab] = useState('content'); // 'layers', 'content', 'style'
  const [activeOperation, setActiveOperation] = useState(''); // 'moving', 'resizing', etc. (用于界面提示)

  // --- 资源库 ---
  const [logoLibrary, setLogoLibrary] = useState([]); 

  // --- Refs ---
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  
  // --- 拖拽与交互状态 Ref ---
  const interactionRef = useRef({
    mode: 'idle', 
    startPointer: { x: 0, y: 0 }, 
    startVal: {}, 
    center: { x: 0, y: 0 },
    // 双指手势专用
    startDistance: 0,
    startAngle: 0,
    startMidpoint: { x: 0, y: 0 },
  });

  // 确保初始化选中图层
  useEffect(() => {
    if (layers.length > 0 && !activeLayerId) {
      setActiveLayerId(layers[0].id);
    }
  }, [layers]);

  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];

  const BLEND_MODES = [
    { value: 'source-over', label: '正常' },
    { value: 'multiply', label: '正片叠底' },
    { value: 'screen', label: '滤色' },
    { value: 'overlay', label: '叠加' },
    { value: 'soft-light', label: '柔光' },
    { value: 'hard-light', label: '强光' },
    { value: 'difference', label: '差值' },
  ];

  // --- 初始化 ---
  useEffect(() => {
    if (!window.JSZip) {
      const script = document.createElement('script');
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      script.onload = () => setIsZipLoaded(true);
      document.body.appendChild(script);
    } else {
      setIsZipLoaded(true);
    }
  }, []);

  // --- 图层操作 ---
  const updateLayer = (id, updates) => {
    setLayers(prev => prev.map(layer => 
      layer.id === id ? { ...layer, ...updates } : layer
    ));
  };

  const updateAllLayers = (updates) => {
    if(window.confirm("确定将当前设置应用到所有图层吗？")) {
       setLayers(prev => prev.map(layer => ({ ...layer, ...updates })));
    }
  };

  const addLayer = (type, logoId = null) => {
    const newLayer = createLayer(type, logoId);
    newLayer.posX = 50 + (layers.length * 2); 
    newLayer.posY = 50 + (layers.length * 2);
    setLayers([...layers, newLayer]);
    setActiveLayerId(newLayer.id);
    setActiveTab('content'); 
  };

  const removeLayer = (id, e) => {
    e?.stopPropagation();
    if (layers.length <= 1) {
      alert("至少保留一个图层");
      return;
    }
    const newLayers = layers.filter(l => l.id !== id);
    setLayers(newLayers);
    if (activeLayerId === id) {
      setActiveLayerId(newLayers[newLayers.length - 1].id);
    }
  };

  const duplicateLayer = (id, e) => {
    e?.stopPropagation();
    const layerToCopy = layers.find(l => l.id === id);
    if (!layerToCopy) return;
    const newLayer = {
      ...layerToCopy,
      id: Date.now() + Math.random().toString(),
      name: layerToCopy.name + " (复制)",
      posX: layerToCopy.posX + 5,
      posY: layerToCopy.posY + 5,
    };
    setLayers([...layers, newLayer]);
    setActiveLayerId(newLayer.id);
  };

  // --- 文件处理 ---
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const newImages = [];
    let loadedCount = 0;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          newImages.push({
            id: Date.now() + Math.random(),
            src: event.target.result,
            file: file,
            imgObject: img,
            width: img.width,
            height: img.height
          });
          loadedCount++;
          if (loadedCount === files.length) {
            setImageList(prev => [...prev, ...newImages]);
            if (imageList.length === 0) setSelectedIndex(0);
          }
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleLogoUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const newLogo = { id: Date.now() + Math.random(), src: event.target.result, imgObject: img, name: file.name };
          setLogoLibrary(prev => [...prev, newLogo]);
          addLayer('image', newLogo.id);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const removeImage = (index, e) => {
    e.stopPropagation();
    const imageToRemove = imageList[index];
    const newList = imageList.filter((_, i) => i !== index);
    setImageList(newList);
    if (selectedIds.has(imageToRemove.id)) {
        const newIds = new Set(selectedIds);
        newIds.delete(imageToRemove.id);
        setSelectedIds(newIds);
    }
    if (index === selectedIndex) setSelectedIndex(Math.max(0, index - 1));
  };

  const toggleSelection = (id, e) => {
      e.stopPropagation();
      const newIds = new Set(selectedIds);
      if (newIds.has(id)) newIds.delete(id);
      else newIds.add(id);
      setSelectedIds(newIds);
  };

  const selectAll = () => {
      setSelectedIds(selectedIds.size === imageList.length ? new Set() : new Set(imageList.map(img => img.id)));
  };

  // --- 核心：获取图层信息 ---
  const getLayerMetrics = useCallback((layer, canvasWidth, canvasHeight) => {
    let contentWidth = 0, contentHeight = 0;
    
    if (layer.type === 'text') {
        const calculatedFontSize = (canvasWidth * (layer.size / 1000)); 
        const textLen = layer.text.length;
        contentWidth = textLen * calculatedFontSize * (layer.text.match(/[\u4e00-\u9fa5]/) ? 1 : 0.6);
        contentHeight = calculatedFontSize;
    } else {
        const logoData = logoLibrary.find(l => l.id === layer.logoId);
        if (logoData) {
            const logoImg = logoData.imgObject;
            const targetWidth = (canvasWidth * (layer.size / 1000));
            const ratio = logoImg.height / logoImg.width;
            contentWidth = targetWidth;
            contentHeight = targetWidth * ratio;
        } else {
            contentWidth = 100;
            contentHeight = 100;
        }
    }
    
    const padding = 20; 
    return {
        cx: (canvasWidth * layer.posX) / 100,
        cy: (canvasHeight * layer.posY) / 100,
        w: contentWidth + padding,
        h: contentHeight + padding,
        rotation: layer.rotation * Math.PI / 180
    };
  }, [logoLibrary]);

  // --- 交互逻辑 (智能多点触控) ---
  const handleTouchStart = (e) => {
    if (!activeLayer || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    // --- 双指操作：缩放 + 旋转 + 移动 ---
    if (e.touches.length === 2) {
        const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };

        const distance = getDistance(p1, p2);
        const angle = getAngle(p1, p2);
        const midpoint = getMidpoint(p1, p2);

        interactionRef.current = {
            mode: 'gesture',
            startDistance: distance,
            startAngle: angle,
            startMidpoint: midpoint,
            startVal: { 
                size: activeLayer.size, 
                rotation: activeLayer.rotation,
                posX: activeLayer.posX,
                posY: activeLayer.posY
            },
            canvasSize: { w: rect.width, h: rect.height }
        };
        setActiveOperation('双指调整中');
        return;
    }

    // --- 单指操作：移动/单点缩放/单点旋转 ---
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;
    
    const mx = (clientX - rect.left) * scaleX;
    const my = (clientY - rect.top) * scaleY;

    const { cx, cy, w, h, rotation } = getLayerMetrics(activeLayer, canvasRef.current.width, canvasRef.current.height);

    const dx = mx - cx;
    const dy = my - cy;
    const lx = dx * Math.cos(-rotation) - dy * Math.sin(-rotation);
    const ly = dx * Math.sin(-rotation) + dy * Math.cos(-rotation);

    const handleRadius = Math.max(40, canvasRef.current.width * 0.08); 

    // 1. 旋转手柄 (顶部)
    const rotateHandleY = -h/2 - handleRadius;
    if (getDistance({x: lx, y: ly}, {x: 0, y: rotateHandleY}) < handleRadius * 1.5) {
        interactionRef.current = {
            mode: 'rotating',
            startPointer: { x: clientX, y: clientY },
            startVal: { rotation: activeLayer.rotation },
            center: { x: cx, y: cy }
        };
        setActiveOperation('旋转中');
        return;
    }

    // 2. 缩放手柄 (右下角)
    if (getDistance({x: lx, y: ly}, {x: w/2, y: h/2}) < handleRadius * 1.5) {
        interactionRef.current = {
            mode: 'resizing',
            startPointer: { x: clientX, y: clientY },
            startVal: { size: activeLayer.size },
            center: { x: cx, y: cy },
        };
        setActiveOperation('缩放中');
        return;
    }

    // 3. 移动检测 (包围盒 + 额外缓冲)
    if (lx >= -w/2 - 20 && lx <= w/2 + 20 && ly >= -h/2 - 20 && ly <= h/2 + 20) {
        interactionRef.current = {
            mode: 'moving',
            startPointer: { x: clientX, y: clientY },
            startVal: { posX: activeLayer.posX, posY: activeLayer.posY },
            canvasSize: { w: rect.width, h: rect.height }
        };
        setActiveOperation('移动中');
        return;
    }

    interactionRef.current.mode = 'idle';
  };

  const handleTouchMove = (e) => {
    // 阻止浏览器默认滚动
    // 注意：React 的 onTouchMove 被动监听可能无法阻止，通常依赖 CSS touch-action: none
    const { mode, startPointer, startVal, center, canvasSize, startDistance, startAngle, startMidpoint } = interactionRef.current;
    if (mode === 'idle' || !activeLayer || !canvasRef.current) return;

    // --- 双指逻辑 ---
    if (mode === 'gesture' && e.touches.length === 2) {
        const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };

        const currentDistance = getDistance(p1, p2);
        const currentAngle = getAngle(p1, p2);
        const currentMidpoint = getMidpoint(p1, p2);

        // 1. 缩放计算 (比率)
        const scaleRatio = currentDistance / startDistance;
        const newSize = Math.max(10, startVal.size * scaleRatio); // 移除上限限制

        // 2. 旋转计算 (增量)
        const angleDelta = currentAngle - startAngle;
        const newRotation = startVal.rotation + angleDelta;

        // 3. 移动计算 (偏移量转百分比)
        const deltaX = currentMidpoint.x - startMidpoint.x;
        const deltaY = currentMidpoint.y - startMidpoint.y;
        const percentX = (deltaX / canvasSize.w) * 100;
        const percentY = (deltaY / canvasSize.h) * 100;
        
        updateLayer(activeLayer.id, { 
            size: newSize,
            rotation: newRotation,
            posX: startVal.posX + percentX,
            posY: startVal.posY + percentY
        });
        return;
    }

    // --- 单指逻辑 ---
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;

    if (mode === 'moving') {
        const deltaX = clientX - startPointer.x;
        const deltaY = clientY - startPointer.y;
        const percentX = (deltaX / canvasSize.w) * 100;
        const percentY = (deltaY / canvasSize.h) * 100;

        updateLayer(activeLayer.id, { 
            posX: startVal.posX + percentX, 
            posY: startVal.posY + percentY 
        });
    } else if (mode === 'rotating') {
        const rect = canvasRef.current.getBoundingClientRect();
        const screenCx = rect.left + (center.x / canvasRef.current.width) * rect.width;
        const screenCy = rect.top + (center.y / canvasRef.current.height) * rect.height;

        let angle = Math.atan2(clientY - screenCy, clientX - screenCx) * 180 / Math.PI;
        angle += 90; 
        updateLayer(activeLayer.id, { rotation: angle });
    } else if (mode === 'resizing') {
        const rect = canvasRef.current.getBoundingClientRect();
        const screenCx = rect.left + (center.x / canvasRef.current.width) * rect.width;
        const screenCy = rect.top + (center.y / canvasRef.current.height) * rect.height;
        
        const currentDist = getDistance({x: screenCx, y: screenCy}, {x: clientX, y: clientY});
        const startScreenDist = getDistance({x: screenCx, y: screenCy}, {x: startPointer.x, y: startPointer.y});
        
        if (startScreenDist > 0) {
            const scaleRatio = currentDist / startScreenDist;
            let newSize = startVal.size * scaleRatio;
            newSize = Math.max(10, newSize); // 移除上限限制
            updateLayer(activeLayer.id, { size: newSize });
        }
    }
  };

  // 鼠标兼容 (主要保留基本单指操作)
  const handleMouseDown = (e) => {
    // 简单的适配，将 MouseEvent 伪装成单指 TouchEvent 结构传给 handleTouchStart
    const fakeTouch = { clientX: e.clientX, clientY: e.clientY };
    handleTouchStart({ touches: [fakeTouch], preventDefault: ()=>{} });
  };
  
  const handleMouseMove = (e) => {
    // 只有在左键按下时才触发移动
    if (e.buttons === 1) {
        const fakeTouch = { clientX: e.clientX, clientY: e.clientY };
        handleTouchMove({ touches: [fakeTouch], preventDefault: ()=>{} });
    }
  };

  const handlePointerUp = () => {
    interactionRef.current.mode = 'idle';
    setActiveOperation('');
  };

  // --- 渲染逻辑 ---
  const renderSingleLayer = (ctx, width, height, layer, isSelected) => {
    let logoImg = null;
    if (layer.type === 'image') {
        const logoData = logoLibrary.find(l => l.id === layer.logoId);
        if (logoData) logoImg = logoData.imgObject;
        else return; 
    }

    ctx.save();
    ctx.globalAlpha = layer.opacity;
    
    let contentWidth, contentHeight;
    const calculatedFontSize = (width * (layer.size / 1000)); 
    
    if (layer.type === 'text') {
        const fontStyle = layer.isItalic ? 'italic' : 'normal';
        const fontWeight = layer.isBold ? 'bold' : 'normal';
        ctx.font = `${fontStyle} ${fontWeight} ${calculatedFontSize}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        const metrics = ctx.measureText(layer.text);
        contentWidth = metrics.width;
        contentHeight = calculatedFontSize; 
    } else if (logoImg) {
        const targetWidth = (width * (layer.size / 1000));
        const ratio = logoImg.height / logoImg.width;
        contentWidth = targetWidth;
        contentHeight = targetWidth * ratio;
    }

    const drawContent = () => {
        ctx.globalCompositeOperation = layer.blendMode;
        if (layer.type === 'text') {
            if (layer.strokeWidth > 0) {
                const scaledStroke = (width * (layer.strokeWidth / 2000)); 
                ctx.lineWidth = Math.max(1, scaledStroke);
                ctx.strokeStyle = layer.strokeColor;
                ctx.lineJoin = 'round';
                ctx.strokeText(layer.text, 0, 0);
            }
            ctx.fillStyle = layer.textColor;
            ctx.shadowColor = "rgba(0,0,0,0.3)";
            ctx.shadowBlur = Math.max(2, layer.size / 100); 
            ctx.shadowOffsetX = Math.max(1, layer.size / 200);
            ctx.shadowOffsetY = Math.max(1, layer.size / 200);
            ctx.fillText(layer.text, 0, 0);
        } else if (logoImg) {
            ctx.shadowColor = "rgba(0,0,0,0.3)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.drawImage(logoImg, -contentWidth/2, -contentHeight/2, contentWidth, contentHeight);
        }
    };

    // 绘制 Gizmo (移动端优化版 - 更大更清晰)
    const drawGizmo = () => {
        if (!isSelected || layer.isTiled) return;

        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1.0;

        const padding = 20; 
        const boxW = contentWidth + padding * 2;
        const boxH = contentHeight + padding * 2;
        const handleR = Math.max(20, width * 0.04); 

        // 1. 边框
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = Math.max(3, width * 0.005);
        ctx.setLineDash([15, 10]);
        ctx.strokeRect(-boxW/2, -boxH/2, boxW, boxH);
        ctx.setLineDash([]);

        // 2. 旋转杆
        ctx.beginPath();
        ctx.moveTo(0, -boxH/2);
        ctx.lineTo(0, -boxH/2 - handleR);
        ctx.stroke();
        
        // 3. 旋转手柄 (顶部) - 绿色
        const rotateY = -boxH/2 - handleR;
        ctx.fillStyle = '#10b981'; // green-500
        ctx.beginPath(); ctx.arc(0, rotateY, handleR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
        // 图标
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(0, rotateY, handleR * 0.3, 0, Math.PI * 2); ctx.fill();

        // 4. 缩放手柄 (右下角) - 蓝色
        const scaleX = boxW/2;
        const scaleY = boxH/2;
        ctx.fillStyle = '#3b82f6'; // blue-500
        ctx.beginPath(); ctx.arc(scaleX, scaleY, handleR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
        // 图标
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(scaleX, scaleY, handleR * 0.3, 0, Math.PI * 2); ctx.fill();
    };

    if (layer.isTiled) {
        const baseGapX = contentWidth * 1.2; 
        const baseGapY = contentHeight * 1.2;
        const extraGap = (width * (layer.tileDensity / 300));
        const gapX = baseGapX + extraGap;
        const gapY = baseGapY + extraGap;
        const buffer = Math.max(width, height) * 1.0;
        
        for (let x = -buffer; x < width + buffer; x += gapX) {
            for (let y = -buffer; y < height + buffer; y += gapY) {
                ctx.save();
                ctx.translate(x, y);
                if ((Math.floor(y / gapY) % 2) !== 0) ctx.translate(gapX / 2, 0);
                ctx.rotate((layer.rotation * Math.PI) / 180);
                drawContent();
                ctx.restore();
            }
        }
    } else {
        const x = (width * layer.posX) / 100;
        const y = (height * layer.posY) / 100;
        ctx.translate(x, y);
        ctx.rotate((layer.rotation * Math.PI) / 180);
        drawContent();
        drawGizmo();
    }
    ctx.restore();
  };

  useEffect(() => {
    const currentImgData = imageList[selectedIndex];
    if (!currentImgData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const image = currentImgData.imgObject;

    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);

    layers.forEach(layer => {
        if (layer.visible) {
            renderSingleLayer(ctx, canvas.width, canvas.height, layer, layer.id === activeLayerId);
        }
    });
  }, [imageList, selectedIndex, layers, logoLibrary, activeLayerId]);

  // --- 导出逻辑 ---
  const handleDownload = async (isBatch) => {
    if (!canvasRef.current || imageList.length === 0) return;
    
    const targets = isBatch 
        ? (selectedIds.size > 0 ? imageList.filter(img => selectedIds.has(img.id)) : imageList)
        : [imageList[selectedIndex]];

    if (targets.length === 0) return;

    if (isBatch && !window.JSZip) {
        alert("组件加载中，请稍后...");
        return;
    }

    setIsProcessing(true);
    setDownloadProgress(0);

    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    const zip = isBatch ? new window.JSZip() : null;
    const folder = isBatch ? zip.folder("watermarked_images") : null;

    for (let i = 0; i < targets.length; i++) {
        const imgData = targets[i];
        tempCanvas.width = imgData.width;
        tempCanvas.height = imgData.height;
        ctx.drawImage(imgData.imgObject, 0, 0);
        layers.forEach(layer => {
            if(layer.visible) renderSingleLayer(ctx, imgData.width, imgData.height, layer, false);
        });
        
        if (isBatch) {
             const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
             folder.file(`watermarked_${imgData.file.name}`, blob);
             setDownloadProgress(Math.round(((i + 1) / targets.length) * 100));
        } else {
             const url = tempCanvas.toDataURL('image/png', 1.0);
             const link = document.createElement('a');
             link.download = `watermarked_${imgData.file.name}`;
             link.href = url;
             link.click();
        }
    }

    if (isBatch) {
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = targets.length === 1 ? `watermarked_${targets[0].file.name}.zip` : `batch_watermarks_${targets.length}.zip`;
        link.click();
    }
    setIsProcessing(false);
    setDownloadProgress(0);
  };

  const SyncButton = ({ propKey, value }) => (
    <button onClick={() => updateAllLayers({ [propKey]: value })} className="text-gray-500 hover:text-blue-400 p-2 rounded-full active:bg-gray-800" title="应用到所有">
        <Copy size={16} />
    </button>
  );

  const HiddenInputs = () => (
    <>
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />
      <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" multiple className="hidden" />
    </>
  );

  // --- UI: 欢迎页 ---
  if (imageList.length === 0) {
     return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="text-center w-full max-w-sm animate-fade-in z-10">
          <div className="mb-8 flex justify-center">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-6 rounded-3xl shadow-2xl shadow-blue-900/30">
              <Layers size={64} className="text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold mb-4 tracking-tight">水印大师</h1>
          <p className="text-gray-400 mb-12 text-lg">双指捏合 · 自由缩放<br/>批量导出工具</p>
          <button 
            onClick={() => fileInputRef.current.click()}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xl font-bold py-5 px-8 rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-3"
          >
            <Upload size={28} /> 选择照片
          </button>
          <HiddenInputs />
        </div>
      </div>
    );
  }

  // --- UI: 主界面 ---
  return (
    <div className="fixed inset-0 bg-black flex flex-col text-white font-sans touch-none overflow-hidden select-none">
      
      {/* 1. 顶部栏 */}
      <div className="h-14 bg-[#18181b] flex items-center justify-between px-4 z-20 flex-shrink-0 shadow-lg">
         <div className="flex items-center gap-3">
             <div className="bg-gray-800 px-3 py-1 rounded-full text-sm font-medium">
                 <span className="text-blue-400 font-bold">{selectedIndex + 1}</span>
                 <span className="text-gray-500"> / {imageList.length}</span>
             </div>
             {selectedIds.size > 0 && <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-1 rounded-full">已选 {selectedIds.size}</span>}
         </div>
         <div className="flex gap-3">
            <button onClick={selectAll} className="p-2 bg-gray-800 rounded-full text-gray-300 active:bg-gray-700 active:text-white transition-colors">
                <CheckCircle2 size={20} />
            </button>
            <button 
                onClick={() => handleDownload(true)}
                disabled={isProcessing}
                className={`px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${isProcessing ? 'bg-gray-800 text-gray-500' : 'bg-blue-600 text-white active:bg-blue-500'}`}
            >
                {isProcessing ? '处理中...' : <><Download size={18} /> 导出</>}
            </button>
         </div>
      </div>

      {/* 2. 画布预览区 */}
      <div 
        className="flex-1 relative bg-[#09090b] overflow-hidden flex items-center justify-center"
        // 使用原生 touch 事件监听
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handlePointerUp}
        onTouchCancel={handlePointerUp}
        // 兼容鼠标 (单指模拟)
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        style={{ touchAction: 'none' }} 
      >
         {/* 透明背景格 */}
         <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
            backgroundImage: 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
         }}></div>
         
         {!activeLayerId && (
            <div className="absolute pointer-events-none text-gray-500 text-sm">点击底部 "+" 添加水印</div>
         )}
         
         {/* 状态提示 */}
         {activeOperation && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur text-white px-4 py-1 rounded-full text-sm font-medium pointer-events-none border border-white/10 z-30">
               {activeOperation}
            </div>
         )}
         
         <canvas ref={canvasRef} className="max-w-[92%] max-h-[92%] object-contain shadow-2xl shadow-black" />
      </div>

      {/* 3. 底部缩略图 */}
      <div className="h-20 bg-[#121214] border-t border-gray-800/50 flex items-center px-3 gap-3 overflow-x-auto no-scrollbar z-20 flex-shrink-0">
          <button onClick={() => fileInputRef.current.click()} className="flex-shrink-0 w-14 h-14 rounded-xl border border-dashed border-gray-600 flex flex-col items-center justify-center text-gray-500 active:bg-gray-800">
            <Plus size={20} /><span className="text-[10px] mt-1">加图</span>
          </button>
          {imageList.map((img, idx) => {
              const isSelected = selectedIds.has(img.id);
              return (
                <div key={img.id} onClick={() => setSelectedIndex(idx)} className={`relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${idx === selectedIndex ? 'border-blue-500 scale-105' : 'border-transparent opacity-70'}`}>
                    <img src={img.src} className="w-full h-full object-cover" alt="" />
                    {isSelected && <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center"><Check size={20} className="text-white drop-shadow-md"/></div>}
                </div>
              );
          })}
      </div>

      {/* 4. 底部控制面板 */}
      <div className="bg-[#18181b] border-t border-gray-800 flex-shrink-0 pb-safe-area shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
          {/* Tab 导航 */}
          <div className="flex items-center justify-around py-1">
              {[
                { id: 'layers', icon: Layers, label: '图层' },
                { id: 'content', icon: TypeIcon, label: '内容' },
                { id: 'style', icon: Sliders, label: '样式' },
              ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 transition-colors relative ${activeTab === tab.id ? 'text-blue-400' : 'text-gray-500'}`}
                  >
                      <tab.icon size={22} strokeWidth={activeTab === tab.id ? 2.5 : 2} /> 
                      <span className="text-[10px] font-bold">{tab.label}</span>
                      {activeTab === tab.id && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-400" />}
                  </button>
              ))}
          </div>

          {/* 面板内容 */}
          <div className="h-64 overflow-y-auto px-5 py-2 custom-scrollbar bg-[#121214]">
              {/* Tab 1: 图层 */}
              {activeTab === 'layers' && (
                  <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => addLayer('text')} className="bg-gray-800 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform border border-gray-700 hover:border-blue-500/50">+ 添加文字</button>
                          <button onClick={() => logoInputRef.current.click()} className="bg-gray-800 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform border border-gray-700 hover:border-blue-500/50">+ 添加图片</button>
                      </div>
                      <div className="space-y-2">
                          {layers.slice().reverse().map((layer) => (
                              <div key={layer.id} onClick={() => setActiveLayerId(layer.id)} className={`flex items-center p-3 rounded-xl border transition-all active:scale-[0.99] ${layer.id === activeLayerId ? 'border-blue-500 bg-blue-900/10' : 'border-gray-800 bg-gray-900'}`}>
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 ${layer.id === activeLayerId ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
                                      {layer.type === 'text' ? <TypeIcon size={16}/> : <ImageIcon size={16}/>}
                                  </div>
                                  <span className="flex-1 text-sm font-medium truncate text-gray-300">{layer.type === 'image' ? (logoLibrary.find(l=>l.id===layer.logoId)?.name || 'Image') : layer.text}</span>
                                  <div className="flex gap-1">
                                      <button onClick={(e) => {e.stopPropagation(); updateLayer(layer.id, {visible: !layer.visible})}} className="p-2 text-gray-500 active:text-white">{layer.visible ? <Eye size={18}/> : <EyeOff size={18}/>}</button>
                                      <button onClick={(e) => duplicateLayer(layer.id, e)} className="p-2 text-gray-500 active:text-white"><Copy size={18}/></button>
                                      <button onClick={(e) => removeLayer(layer.id, e)} className="p-2 text-gray-500 active:text-red-400"><Trash2 size={18}/></button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              {/* Tab 2: 内容 */}
              {activeTab === 'content' && activeLayer && (
                  <div className="space-y-6 pt-2">
                      {activeLayer.type === 'text' ? (
                          <>
                            <div className="space-y-2">
                                <label className="text-xs text-gray-400 font-bold ml-1">文本内容</label>
                                <input type="text" value={activeLayer.text} onChange={e => updateLayer(activeLayer.id, {text: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-4 text-white text-base focus:border-blue-500 outline-none" placeholder="输入水印文字" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs text-gray-400 font-bold ml-1">颜色</label>
                                    <div className="flex items-center gap-3 bg-gray-800 p-2 rounded-xl border border-gray-700">
                                        <input type="color" value={activeLayer.textColor} onChange={e => updateLayer(activeLayer.id, {textColor: e.target.value})} className="w-10 h-10 rounded-lg border-none bg-transparent"/>
                                        <span className="text-xs text-gray-400 font-mono">{activeLayer.textColor}</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-gray-400 font-bold ml-1">样式</label>
                                    <div className="flex gap-2 h-[58px]">
                                        <button onClick={()=>updateLayer(activeLayer.id, {isBold: !activeLayer.isBold})} className={`flex-1 rounded-xl border border-gray-700 transition-colors ${activeLayer.isBold ? 'bg-blue-600 border-blue-500' : 'bg-gray-800 text-gray-400'}`}><Bold size={20} className="mx-auto"/></button>
                                        <button onClick={()=>updateLayer(activeLayer.id, {isItalic: !activeLayer.isItalic})} className={`flex-1 rounded-xl border border-gray-700 transition-colors ${activeLayer.isItalic ? 'bg-blue-600 border-blue-500' : 'bg-gray-800 text-gray-400'}`}><Italic size={20} className="mx-auto"/></button>
                                    </div>
                                </div>
                            </div>
                          </>
                      ) : (
                          <div className="grid grid-cols-4 gap-3">
                              {logoLibrary.map(logo => (
                                  <div key={logo.id} onClick={() => updateLayer(activeLayer.id, {logoId: logo.id})} className={`aspect-square rounded-xl border-2 bg-gray-800 p-2 ${activeLayer.logoId === logo.id ? 'border-blue-500' : 'border-transparent'}`}>
                                      <img src={logo.src} className="w-full h-full object-contain" alt=""/>
                                  </div>
                              ))}
                              <div onClick={() => logoInputRef.current.click()} className="aspect-square rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center text-gray-500 active:bg-gray-800"><Plus size={24}/></div>
                          </div>
                      )}
                      
                      <div className="space-y-2">
                           <div className="flex justify-between items-center"><label className="text-xs text-gray-400 font-bold ml-1">混合模式</label><SyncButton propKey="blendMode" value={activeLayer.blendMode}/></div>
                           <div className="flex flex-wrap gap-2">
                               {BLEND_MODES.slice(0, 5).map(m => (
                                   <button key={m.value} onClick={() => updateLayer(activeLayer.id, {blendMode: m.value})} className={`px-3 py-2 rounded-lg text-xs font-medium border ${activeLayer.blendMode === m.value ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>{m.label}</button>
                               ))}
                           </div>
                      </div>
                  </div>
              )}

              {/* Tab 3: 样式 (无限制版) */}
              {activeTab === 'style' && activeLayer && (
                  <div className="space-y-6 pt-2">
                      <div className="space-y-3">
                          <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-400 font-bold ml-1">大小 (无限制)</span>
                              <div className="flex items-center gap-2">
                                 <input type="number" value={Math.round(activeLayer.size)} onChange={e => updateLayer(activeLayer.id, {size: Number(e.target.value)})} className="w-16 bg-gray-800 text-right text-xs p-1 rounded border border-gray-700 text-blue-400"/>
                                 <SyncButton propKey="size" value={activeLayer.size}/>
                              </div>
                          </div>
                          {/* 允许拉到很大 (10000)，但也可以通过输入框或双指设置更大 */}
                          <input type="range" min="10" max="10000" step="1" value={Math.min(10000, activeLayer.size)} onChange={e => updateLayer(activeLayer.id, {size: Number(e.target.value)})} className="custom-range w-full"/>
                      </div>

                      <div className="space-y-3">
                          <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-400 font-bold ml-1">不透明度</span>
                              <div className="flex items-center gap-2">
                                 <span className="text-xs bg-gray-800 px-2 py-1 rounded text-blue-400 font-mono">{Math.round(activeLayer.opacity*100)}%</span>
                                 <SyncButton propKey="opacity" value={activeLayer.opacity}/>
                              </div>
                          </div>
                          <input type="range" min="0" max="1" step="0.01" value={activeLayer.opacity} onChange={e => updateLayer(activeLayer.id, {opacity: Number(e.target.value)})} className="custom-range w-full"/>
                      </div>

                      <div className="space-y-3">
                          <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-400 font-bold ml-1">旋转</span>
                              <div className="flex items-center gap-2">
                                 <span className="text-xs bg-gray-800 px-2 py-1 rounded text-blue-400 font-mono">{Math.round(activeLayer.rotation)}°</span>
                                 <SyncButton propKey="rotation" value={activeLayer.rotation}/>
                              </div>
                          </div>
                          <input type="range" min="0" max="360" step="1" value={activeLayer.rotation} onChange={e => updateLayer(activeLayer.id, {rotation: Number(e.target.value)})} className="custom-range w-full"/>
                      </div>
                      
                      {/* 平铺开关 (大按钮) */}
                      <div className="bg-gray-800/50 rounded-xl p-4 flex items-center justify-between border border-gray-800">
                          <div className="flex items-center gap-3">
                              <Grid3X3 size={20} className="text-gray-400"/>
                              <div className="flex flex-col">
                                  <span className="text-sm font-bold text-gray-300">全屏平铺</span>
                                  <span className="text-[10px] text-gray-500">自动填满整个画面</span>
                              </div>
                          </div>
                          <button onClick={() => updateLayer(activeLayer.id, {isTiled: !activeLayer.isTiled})} className={`w-14 h-8 rounded-full relative transition-colors ${activeLayer.isTiled ? 'bg-blue-600' : 'bg-gray-700'}`}>
                              <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform shadow-sm ${activeLayer.isTiled ? 'translate-x-6' : 'translate-x-0'}`}/>
                          </button>
                      </div>

                      {activeLayer.isTiled && (
                          <div className="space-y-3">
                              <div className="flex justify-between items-center"><span className="text-xs text-gray-400 font-bold ml-1">平铺密度</span><SyncButton propKey="tileDensity" value={activeLayer.tileDensity}/></div>
                              <input type="range" min="10" max="150" value={activeLayer.tileDensity} onChange={e => updateLayer(activeLayer.id, {tileDensity: Number(e.target.value)})} className="custom-range w-full"/>
                          </div>
                      )}
                  </div>
              )}
          </div>
      </div>
      
      {/* 样式注入: 优化滑动条手感 */}
      <style>{`
        .pb-safe-area { padding-bottom: env(safe-area-inset-bottom); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        .custom-range {
            -webkit-appearance: none;
            height: 6px;
            background: #27272a;
            border-radius: 3px;
            outline: none;
        }
        .custom-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: 3px solid #18181b;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
      `}</style>
    </div>
  );
};

export default WatermarkApp;