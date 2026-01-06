import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Image as ImageIcon, X, Layers, Grid3X3, Bold, Italic, Type as TypeIcon, Blend, Plus, Trash2, CheckCircle2, Copy, Eye, EyeOff, Move, Palette, Sliders, Menu, Maximize, RotateCw, Check, PaintBucket, Sun } from 'lucide-react';

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
  strokeWidth: 0, // 默认不描边
  strokeColor: '#000000',
  logoId: logoId,
  hasBackground: false,
  backgroundColor: '#000000',
  backgroundPadding: 0,
  hasShadow: false // 关键修改：默认关闭阴影，保持原色
});

// 几何算法
const getDistance = (p1, p2) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
const getAngle = (p1, p2) => Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
const getMidpoint = (p1, p2) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });

const WatermarkApp = () => {
  // --- 状态管理 ---
  const [imageList, setImageList] = useState([]); 
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set()); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipLoaded, setIsZipLoaded] = useState(false);

  const [layers, setLayers] = useState([createLayer('text')]); 
  const [activeLayerId, setActiveLayerId] = useState(null); 
  const [activeTab, setActiveTab] = useState('content'); 
  const [activeOperation, setActiveOperation] = useState(''); 
  const [logoLibrary, setLogoLibrary] = useState([]); 

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
  });

  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];

  const BLEND_MODES = [
    { value: 'source-over', label: '正常 (遮挡)' }, 
    { value: 'multiply', label: '正片叠底' },
    { value: 'screen', label: '滤色' },
    { value: 'overlay', label: '叠加' }, 
    { value: 'soft-light', label: '柔光' },
    { value: 'hard-light', label: '强光' },
    { value: 'difference', label: '差值' },
  ];

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

  useEffect(() => {
    if (layers.length > 0 && !activeLayerId) {
      setActiveLayerId(layers[0].id);
    }
  }, [layers, activeLayerId]);

  // --- 状态更新 ---
  const updateLayer = (id, updates) => {
    setLayers(prev => prev.map(layer => layer.id === id ? { ...layer, ...updates } : layer));
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
    if (layers.length <= 1) return alert("至少保留一个图层");
    const newLayers = layers.filter(l => l.id !== id);
    setLayers(newLayers);
    if (activeLayerId === id) setActiveLayerId(newLayers[newLayers.length - 1].id);
  };

  const duplicateLayer = (id, e) => {
    e?.stopPropagation();
    const layerToCopy = layers.find(l => l.id === id);
    if (!layerToCopy) return;
    const newLayer = { ...layerToCopy, id: Date.now() + Math.random().toString(), name: layerToCopy.name + " (复制)", posX: layerToCopy.posX + 5, posY: layerToCopy.posY + 5 };
    setLayers([...layers, newLayer]);
    setActiveLayerId(newLayer.id);
  };

  const deleteLogo = (id, e) => {
    e.stopPropagation();
    if(window.confirm("确定删除这个图片素材吗？")) {
        setLogoLibrary(prev => prev.filter(logo => logo.id !== id));
    }
  };

  const handleFillCanvas = () => {
    if (!activeLayer || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const canvasRatio = canvas.width / canvas.height;
    
    let newSize = 1000; 

    if (activeLayer.type === 'text') {
        newSize = 1500; 
    } else {
        const logoData = logoLibrary.find(l => l.id === activeLayer.logoId);
        if (logoData) {
            const img = logoData.imgObject;
            const imgRatio = img.width / img.height;
            if (imgRatio > canvasRatio) {
                 newSize = (1 / canvasRatio * imgRatio) * 1000;
            } else {
                 newSize = 1000;
            }
        }
    }
    
    updateLayer(activeLayer.id, {
        size: Math.ceil(newSize * 1.1), 
        posX: 50,
        posY: 50,
        rotation: 0,
        isTiled: false,
        opacity: 1 
    });
    setActiveOperation('已铺满 (遮挡)');
    setTimeout(() => setActiveOperation(''), 1000);
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setImageList(prev => [...prev, { 
            id: Date.now() + Math.random(), 
            src: event.target.result, 
            file, 
            imgObject: img, 
            width: img.width, 
            height: img.height 
          }]);
          if (imageList.length === 0) setSelectedIndex(0);
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
    if(!window.confirm("移除这张底图？")) return;
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

  const selectAll = () => {
      setSelectedIds(selectedIds.size === imageList.length ? new Set() : new Set(imageList.map(img => img.id)));
  };

  // --- 核心：触控交互与计算 ---
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

  const handleTouchStart = (e) => {
    if (!activeLayer || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

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
            
            const { cx, cy, w, h, rotation } = getLayerMetrics(layer, canvasRef.current.width, canvasRef.current.height);
            const dx = mx - cx;
            const dy = my - cy;
            const lx = dx * Math.cos(-rotation) - dy * Math.sin(-rotation);
            const ly = dx * Math.sin(-rotation) + dy * Math.cos(-rotation);
            
            if (lx >= -w/2 - 20 && lx <= w/2 + 20 && ly >= -h/2 - 20 && ly <= h/2 + 20) {
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
  const handleMouseDown = (e) => handleTouchStart({ touches: [{ clientX: e.clientX, clientY: e.clientY }], preventDefault: ()=>{} });
  const handleMouseMove = (e) => { if (e.buttons === 1) handleTouchMove({ touches: [{ clientX: e.clientX, clientY: e.clientY }], preventDefault: ()=>{} }); };

  // --- 画布渲染 (核心修复区) ---
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
        const measure = ctx.measureText(layer.text);
        contentWidth = measure.width; 
        contentHeight = fontSize;
    } else if (logoImg) {
        contentWidth = (width * (layer.size / 1000));
        contentHeight = contentWidth * (logoImg.height / logoImg.width);
    }

    const drawContent = () => {
        ctx.globalCompositeOperation = layer.blendMode;
        
        // 背景底板
        if (layer.hasBackground) {
            const pad = layer.backgroundPadding || 0; 
            ctx.fillStyle = layer.backgroundColor;
            ctx.fillRect(-contentWidth/2 - pad, -contentHeight/2 - pad, contentWidth + pad*2, contentHeight + pad*2);
        }

        // 阴影处理：只有当 hasShadow 为 true 且没有背景时才渲染
        // 这也是解决“色调变脏”的关键
        if (layer.hasShadow && !layer.hasBackground) {
            ctx.shadowColor = "rgba(0,0,0,0.5)"; 
            ctx.shadowBlur = Math.max(2, layer.size/100); 
            ctx.shadowOffsetX = Math.max(1, layer.size/200); 
            ctx.shadowOffsetY = Math.max(1, layer.size/200); 
        } else {
            ctx.shadowColor = "transparent";
        }

        if (layer.type === 'text') {
            if (layer.strokeWidth > 0) {
                ctx.lineWidth = Math.max(1, (width * (layer.strokeWidth / 2000))); ctx.strokeStyle = layer.strokeColor; ctx.lineJoin = 'round'; ctx.strokeText(layer.text, 0, 0);
            }
            ctx.fillStyle = layer.textColor; 
            ctx.fillText(layer.text, 0, 0);
        } else {
            ctx.drawImage(logoImg, -contentWidth/2, -contentHeight/2, contentWidth, contentHeight);
        }
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
        if (isSelected) {
            ctx.globalCompositeOperation = 'source-over'; ctx.shadowColor = 'transparent'; ctx.globalAlpha = 1.0;
            const pad = 20, boxW = contentWidth + pad * 2, boxH = contentHeight + pad * 2;
            const handleR = Math.max(20, width * 0.04);
            
            ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = Math.max(3, width * 0.005); 
            ctx.setLineDash([15, 10]); ctx.strokeRect(-boxW/2, -boxH/2, boxW, boxH); ctx.setLineDash([]);
            
            ctx.beginPath(); ctx.moveTo(0, -boxH/2); ctx.lineTo(0, -boxH/2 - handleR); ctx.stroke();
            
            const drawHandle = (cx, cy, color) => {
                ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, handleR, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            };
            drawHandle(0, -boxH/2 - handleR, '#10b981'); 
            drawHandle(boxW/2, boxH/2, '#3b82f6');    
        }
    }
    ctx.restore();
  };

  useEffect(() => {
    const imgData = imageList[selectedIndex];
    if (!imgData || !canvasRef.current) return;
    
    // 关键修复：开启 Display P3 色域支持
    const ctx = canvasRef.current.getContext('2d', { colorSpace: 'display-p3' });
    
    canvasRef.current.width = imgData.width; canvasRef.current.height = imgData.height;
    ctx.drawImage(imgData.imgObject, 0, 0);
    layers.forEach(l => l.visible && renderSingleLayer(ctx, imgData.width, imgData.height, l, l.id === activeLayerId));
  }, [imageList, selectedIndex, layers, activeLayerId, logoLibrary]);

  // --- 导出逻辑 ---
  const handleDownload = async () => {
    if (!canvasRef.current || imageList.length === 0) return;
    setIsProcessing(true); 
    const zip = new window.JSZip(); const folder = zip.folder("watermarked");
    const tempCanvas = document.createElement('canvas'); 
    // 导出时同样使用 P3 色域
    const ctx = tempCanvas.getContext('2d', { colorSpace: 'display-p3' });
    
    for (let i = 0; i < imageList.length; i++) {
        const img = imageList[i];
        if (selectedIds.size > 0 && !selectedIds.has(img.id)) continue;
        tempCanvas.width = img.width; tempCanvas.height = img.height;
        ctx.drawImage(img.imgObject, 0, 0);
        layers.forEach(l => l.visible && renderSingleLayer(ctx, img.width, img.height, l, false));
        // 使用最高质量 1.0
        const blob = await new Promise(r => tempCanvas.toBlob(r, 'image/jpeg', 1.0));
        folder.file(`wm_${img.file.name}`, blob);
    }
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a'); link.href = URL.createObjectURL(content);
    link.download = "watermarked_images.zip"; link.click();
    setIsProcessing(false);
  };

  const SyncButton = ({ prop, val }) => (
    <button onClick={() => updateAllLayers({ [prop]: val })} className="text-gray-500 hover:text-blue-400 p-2"><Copy size={16} /></button>
  );

  const renderInputs = () => (
    <>
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />
      <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" multiple className="hidden" />
    </>
  );

  if (imageList.length === 0) return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-6 rounded-3xl mb-8 shadow-xl"><Layers size={64}/></div>
        <h1 className="text-3xl font-bold mb-4">水印大师</h1>
        <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 px-8 py-4 rounded-xl font-bold flex gap-2"><Upload/> 选择照片</button>
        {renderInputs()}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black flex flex-col text-white touch-none select-none">
        <div className="h-14 bg-[#18181b] flex items-center justify-between px-4 z-20">
            <div className="flex gap-3 items-center">
                <span className="font-bold text-blue-400">{selectedIndex + 1} / {imageList.length}</span>
                <button onClick={selectAll} className="p-2 bg-gray-800 rounded-full"><CheckCircle2 size={18}/></button>
            </div>
            <button onClick={handleDownload} disabled={isProcessing} className="bg-blue-600 px-4 py-1.5 rounded-full text-sm font-bold flex gap-2">
                {isProcessing ? '...' : <><Download size={16}/> 导出</>}
            </button>
        </div>

        <div className="flex-1 relative bg-[#09090b] flex items-center justify-center overflow-hidden"
             onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handlePointerUp} onTouchCancel={handlePointerUp}
             onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}>
            {activeOperation && <div className="absolute top-4 bg-black/60 px-4 py-1 rounded-full text-sm z-30 pointer-events-none border border-white/10">{activeOperation}</div>}
            <canvas ref={canvasRef} className="max-w-[95%] max-h-[95%] object-contain shadow-2xl"/>
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
                        <div className="flex items-center justify-between bg-gray-800 p-2 rounded-lg border border-gray-700">
                            <div className="flex items-center gap-2">
                                <PaintBucket size={16} className="text-gray-400"/>
                                <span className="text-xs text-gray-300 font-bold">背景底板 (强遮挡)</span>
                            </div>
                            <div className="flex items-center gap-3">
                                {activeLayer.hasBackground && (
                                    <div className="flex items-center gap-2">
                                        <input type="color" value={activeLayer.backgroundColor} onChange={e => updateLayer(activeLayer.id, {backgroundColor: e.target.value})} className="w-6 h-6 rounded border-none bg-transparent"/>
                                    </div>
                                )}
                                <button 
                                    onClick={() => updateLayer(activeLayer.id, {hasBackground: !activeLayer.hasBackground})} 
                                    className={`w-10 h-5 rounded-full relative transition-colors ${activeLayer.hasBackground ? 'bg-green-500' : 'bg-gray-600'}`}
                                >
                                    <span className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${activeLayer.hasBackground ? 'translate-x-5' : ''}`}/>
                                </button>
                            </div>
                        </div>

                        {activeLayer.type === 'text' ? (
                            <>
                                <input type="text" value={activeLayer.text} onChange={e => updateLayer(activeLayer.id, {text: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none"/>
                                <div className="flex gap-2">
                                    <div className="flex items-center gap-2 bg-gray-800 p-2 rounded border border-gray-700 flex-1">
                                        <input type="color" value={activeLayer.textColor} onChange={e => updateLayer(activeLayer.id, {textColor: e.target.value})} className="w-6 h-6 bg-transparent border-none"/>
                                        <span className="text-xs text-gray-400">{activeLayer.textColor}</span>
                                    </div>
                                    <button onClick={()=>updateLayer(activeLayer.id, {isBold: !activeLayer.isBold})} className={`p-2 rounded border ${activeLayer.isBold ? 'bg-blue-600 border-blue-600' : 'border-gray-700'}`}><Bold size={16}/></button>
                                    <button onClick={()=>updateLayer(activeLayer.id, {isItalic: !activeLayer.isItalic})} className={`p-2 rounded border ${activeLayer.isItalic ? 'bg-blue-600 border-blue-600' : 'border-gray-700'}`}><Italic size={16}/></button>
                                </div>
                            </>
                        ) : (
                            <div className="grid grid-cols-4 gap-2">
                                {logoLibrary.map(l => (
                                    <div key={l.id} onClick={() => updateLayer(activeLayer.id, {logoId: l.id})} className={`aspect-square border rounded p-1 relative ${activeLayer.logoId === l.id ? 'border-blue-500' : 'border-gray-700'}`}>
                                        <img src={l.src} className="w-full h-full object-contain"/>
                                        <button onClick={(e) => deleteLogo(l.id, e)} className="absolute top-0 right-0 bg-red-600 text-white w-4 h-4 flex items-center justify-center rounded-bl"><X size={10}/></button>
                                    </div>
                                ))}
                                <button onClick={() => logoInputRef.current?.click()} className="border border-dashed border-gray-600 rounded flex items-center justify-center text-gray-500"><Plus size={20}/></button>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {BLEND_MODES.slice(0,5).map(m => (
                                <button key={m.value} onClick={() => updateLayer(activeLayer.id, {blendMode: m.value})} className={`px-2 py-1 text-xs rounded border ${activeLayer.blendMode === m.value ? 'bg-blue-600 border-blue-600' : 'border-gray-700 text-gray-400'}`}>{m.label}</button>
                            ))}
                        </div>
                        <button onClick={(e) => removeLayer(activeLayer.id, e)} className="w-full py-2 mt-2 bg-red-900/30 text-red-400 border border-red-900/50 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                            <Trash2 size={16} /> 删除当前图层
                        </button>
                    </div>
                )}
                {activeTab === 'style' && activeLayer && (
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-400">大小</span>
                                <div className="flex gap-2">
                                    <button 
                                      onClick={handleFillCanvas}
                                      className="text-[10px] bg-blue-900/30 text-blue-400 border border-blue-800 px-2 py-0.5 rounded flex items-center gap-1 active:bg-blue-800"
                                    >
                                        <Maximize size={10} /> 一键铺满
                                    </button>
                                    <SyncButton prop="size" val={activeLayer.size}/>
                                </div>
                            </div>
                            <input type="range" min="10" max="10000" step="1" value={activeLayer.size} onChange={e => updateLayer(activeLayer.id, {size: Number(e.target.value)})} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                        </div>

                        {['opacity', 'rotation'].map(k => (
                            <div key={k} className="space-y-1">
                                <div className="flex justify-between"><span className="text-xs text-gray-400 capitalize">{k}</span><SyncButton prop={k} val={activeLayer[k]}/></div>
                                <input type="range" 
                                    min={k === 'opacity' ? 0 : 0} 
                                    max={k === 'opacity' ? 1 : 360} 
                                    step={k === 'opacity' ? 0.01 : 1}
                                    value={activeLayer[k]} 
                                    onChange={e => updateLayer(activeLayer.id, {[k]: Number(e.target.value)})} 
                                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                            </div>
                        ))}
                        
                        {/* 投影开关 */}
                        <div className="flex items-center justify-between border-t border-gray-700 pt-2">
                            <div className="flex items-center gap-2">
                                <Sun size={14} className="text-gray-400"/>
                                <span className="text-xs text-gray-400">投影 (建议关闭保持原色)</span>
                            </div>
                            <button onClick={() => updateLayer(activeLayer.id, {hasShadow: !activeLayer.hasShadow})} className={`w-10 h-5 rounded-full relative transition-colors ${activeLayer.hasShadow ? 'bg-blue-600' : 'bg-gray-600'}`}>
                                <span className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${activeLayer.hasShadow ? 'translate-x-5' : ''}`}/>
                            </button>
                        </div>

                        <div className="flex items-center justify-between border-t border-gray-700 pt-2">
                            <span className="text-xs text-gray-400">平铺模式</span>
                            <button onClick={() => updateLayer(activeLayer.id, {isTiled: !activeLayer.isTiled})} className={`w-10 h-6 rounded-full relative transition-colors ${activeLayer.isTiled ? 'bg-blue-600' : 'bg-gray-700'}`}>
                                <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${activeLayer.isTiled ? 'translate-x-4' : ''}`}/>
                            </button>
                        </div>
                        {activeLayer.isTiled && (
                            <div className="space-y-1">
                                <div className="flex justify-between"><span className="text-xs text-gray-400">密度</span><SyncButton prop="tileDensity" val={activeLayer.tileDensity}/></div>
                                <input type="range" min="10" max="150" value={activeLayer.tileDensity} onChange={e => updateLayer(activeLayer.id, {tileDensity: Number(e.target.value)})} className="w-full h-1 bg-gray-700 rounded-lg appearance-none accent-blue-500"/>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
        {renderInputs()}
        <style>{`.pb-safe-area{padding-bottom:env(safe-area-inset-bottom)}`}</style>
    </div>
  );
};

export default WatermarkApp;