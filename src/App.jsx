import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Image as ImageIcon, X, Layers, Grid3X3, Bold, Italic, Type as TypeIcon, Blend, Plus, Trash2, CheckCircle2, Copy, Eye, EyeOff, Move, Palette, Sliders, Menu } from 'lucide-react';

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

  // --- 资源库 ---
  const [logoLibrary, setLogoLibrary] = useState([]); 

  // --- Refs ---
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  
  // 拖拽相关 Refs
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialPosRef = useRef({ x: 0, y: 0 });

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
    { value: 'color-dodge', label: '颜色减淡' },
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
    if(window.confirm("应用此设置到所有图层？")) {
       setLayers(prev => prev.map(layer => ({ ...layer, ...updates })));
    }
  };

  const addLayer = (type, logoId = null) => {
    const newLayer = createLayer(type, logoId);
    newLayer.posX = 50 + (layers.length * 2); 
    newLayer.posY = 50 + (layers.length * 2);
    setLayers([...layers, newLayer]);
    setActiveLayerId(newLayer.id);
    setActiveTab('content'); // 切换到内容页方便编辑
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

  // --- 交互逻辑 (触控拖拽) ---
  const handlePointerDown = (e) => {
    if (!activeLayer || activeLayer.isTiled || !canvasRef.current) return;
    // 阻止移动端浏览器默认行为（如滚动）
    // e.preventDefault(); // 注：在 React 18+ 被动事件监听器中可能无效，改为 CSS touch-action: none
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    isDraggingRef.current = true;
    dragStartRef.current = { x: clientX, y: clientY };
    initialPosRef.current = { x: activeLayer.posX, y: activeLayer.posY };
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current || !activeLayer || !canvasRef.current) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rect = canvasRef.current.getBoundingClientRect();
    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;

    // 将像素位移转换为百分比 (0-100)
    const percentX = (deltaX / rect.width) * 100;
    const percentY = (deltaY / rect.height) * 100;

    const newX = initialPosRef.current.x + percentX;
    const newY = initialPosRef.current.y + percentY;

    updateLayer(activeLayer.id, { posX: newX, posY: newY });
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  // --- 绘图逻辑 ---
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
        if (layer.visible) renderSingleLayer(ctx, canvas.width, canvas.height, layer);
    });
  }, [imageList, selectedIndex, layers, logoLibrary]);

  const renderSingleLayer = (ctx, width, height, layer) => {
    let logoImg = null;
    if (layer.type === 'image') {
        const logoData = logoLibrary.find(l => l.id === layer.logoId);
        if (logoData) logoImg = logoData.imgObject;
        else return; 
    }

    ctx.save();
    ctx.globalAlpha = layer.opacity;
    
    let contentWidth, contentHeight;
    if (layer.type === 'text') {
        const fontStyle = layer.isItalic ? 'italic' : 'normal';
        const fontWeight = layer.isBold ? 'bold' : 'normal';
        const calculatedFontSize = (width * (layer.size / 1000)); 
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
    }
    ctx.restore();
  };

  // --- 导出逻辑 ---
  const handleDownloadCurrent = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `watermarked_${imageList[selectedIndex].file.name}`;
    link.href = canvasRef.current.toDataURL('image/png', 1.0);
    link.click();
  };

  const handleBatchDownload = async () => {
    if (!window.JSZip || imageList.length === 0) return;
    const targets = selectedIds.size > 0 ? imageList.filter(img => selectedIds.has(img.id)) : imageList;
    if (targets.length === 0) return;

    setIsProcessing(true);
    setDownloadProgress(0);
    const zip = new window.JSZip();
    const folder = zip.folder("watermarked_images");
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');

    for (let i = 0; i < targets.length; i++) {
        const imgData = targets[i];
        tempCanvas.width = imgData.width;
        tempCanvas.height = imgData.height;
        ctx.drawImage(imgData.imgObject, 0, 0);
        layers.forEach(layer => {
            if(layer.visible) renderSingleLayer(ctx, imgData.width, imgData.height, layer);
        });
        const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
        folder.file(`watermarked_${imgData.file.name}`, blob);
        setDownloadProgress(Math.round(((i + 1) / targets.length) * 100));
    }

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = targets.length === 1 ? `watermarked_${targets[0].file.name}.zip` : `batch_watermarks_${targets.length}.zip`;
    link.click();
    setIsProcessing(false);
    setDownloadProgress(0);
  };

  // --- UI 组件：通用应用按钮 ---
  const SyncButton = ({ propKey, value }) => (
    <button 
        onClick={() => updateAllLayers({ [propKey]: value })}
        className="text-gray-500 hover:text-blue-400 p-1.5 rounded-full hover:bg-gray-800 transition-colors"
        title="应用到所有图层"
    >
        <Copy size={14} />
    </button>
  );

  // --- 渲染：欢迎页面 ---
  if (imageList.length === 0) {
     return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="text-center max-w-md w-full animate-fade-in z-10">
          <div className="mb-6 flex justify-center">
            <div className="bg-gradient-to-tr from-blue-500 to-purple-600 p-5 rounded-2xl shadow-xl shadow-blue-900/20">
              <Layers size={56} className="text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-3">水印大师 <span className="text-blue-400 text-sm align-top font-normal border border-blue-500/30 px-2 py-0.5 rounded-full bg-blue-500/10">Mobile</span></h1>
          <p className="text-gray-400 mb-8">极简操作 · 触控拖拽 · 批量导出</p>
          <button 
            onClick={() => fileInputRef.current.click()}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-lg font-semibold py-4 px-6 rounded-xl shadow-lg shadow-blue-600/20 active:scale-95 flex items-center justify-center gap-3"
          >
            <Upload size={24} /> 导入照片 (支持批量)
          </button>
          <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />
        </div>
      </div>
    );
  }

  // --- 渲染：主界面 ---
  return (
    <div className="fixed inset-0 bg-black flex flex-col text-white font-sans touch-none">
      
      {/* 1. 顶部栏 (紧凑) */}
      <div className="h-12 bg-[#18181b] border-b border-gray-800 flex items-center justify-between px-4 z-20 flex-shrink-0">
         <div className="flex items-center gap-2 text-sm font-medium">
             <span className="text-blue-400 font-bold">{selectedIndex + 1}</span>
             <span className="text-gray-600">/ {imageList.length}</span>
             {selectedIds.size > 0 && <span className="text-xs bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded">已选 {selectedIds.size}</span>}
         </div>
         <div className="flex gap-2">
            <button onClick={selectAll} className="p-2 text-gray-400 hover:text-white"><CheckCircle2 size={18} /></button>
            <button 
                onClick={handleBatchDownload}
                disabled={isProcessing}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${isProcessing ? 'bg-gray-800 text-gray-400' : 'bg-blue-600 text-white active:scale-95'}`}
            >
                {isProcessing ? '处理中...' : <><Download size={14} /> 导出</>}
            </button>
         </div>
      </div>

      {/* 2. 画布预览区 (自适应剩余空间) */}
      <div 
        className="flex-1 relative bg-[#09090b] overflow-hidden flex items-center justify-center"
        // 绑定触控事件
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        style={{ touchAction: 'none' }} // 关键：禁止浏览器处理触摸手势
      >
         {/* 透明背景格 */}
         <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
            backgroundImage: 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
         }}></div>
         
         <div className="absolute top-4 left-0 w-full text-center pointer-events-none opacity-40 text-[10px] text-white/50 z-10">
             单指拖动水印 · 双指缩放/旋转(待开发)
         </div>

         <canvas ref={canvasRef} className="max-w-[95%] max-h-[95%] object-contain shadow-2xl shadow-black" />
      </div>

      {/* 3. 底部缩略图 (高度固定) */}
      <div className="h-16 bg-[#18181b] border-t border-gray-800 flex items-center px-2 gap-2 overflow-x-auto no-scrollbar z-20 flex-shrink-0">
          <button onClick={() => fileInputRef.current.click()} className="flex-shrink-0 w-12 h-12 rounded border border-dashed border-gray-600 flex items-center justify-center text-gray-500 hover:bg-gray-800"><Plus size={18} /></button>
          {imageList.map((img, idx) => {
              const isSelected = selectedIds.has(img.id);
              return (
                <div key={img.id} onClick={() => setSelectedIndex(idx)} className={`relative flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${idx === selectedIndex ? 'border-blue-500' : 'border-transparent opacity-60'}`}>
                    <img src={img.src} className="w-full h-full object-cover" alt="" />
                    <div onClick={(e) => toggleSelection(img.id, e)} className="absolute bottom-0 right-0 p-0.5 bg-black/50 backdrop-blur-sm rounded-tl">
                        {isSelected ? <CheckCircle2 size={10} className="text-green-400" /> : <div className="w-2.5 h-2.5 rounded-full border border-gray-400" />}
                    </div>
                </div>
              );
          })}
      </div>

      {/* 4. 控制面板 (Tab 模式) */}
      <div className="bg-[#121214] border-t border-gray-800 flex-shrink-0 pb-safe-area">
          {/* Tab 导航 */}
          <div className="flex border-b border-gray-800">
              {[
                { id: 'layers', icon: Layers, label: '图层' },
                { id: 'content', icon: TypeIcon, label: '内容' },
                { id: 'style', icon: Sliders, label: '样式' },
              ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 py-3 flex items-center justify-center gap-2 text-xs font-bold transition-colors ${activeTab === tab.id ? 'text-blue-400 bg-blue-900/10 border-b-2 border-blue-400' : 'text-gray-500'}`}
                  >
                      <tab.icon size={16} /> {tab.label}
                  </button>
              ))}
          </div>

          {/* Tab 内容区 - 固定高度可滚动 */}
          <div className="h-56 overflow-y-auto p-4 custom-scrollbar">
              
              {/* Tab 1: 图层管理 */}
              {activeTab === 'layers' && (
                  <div className="space-y-3">
                      <div className="flex gap-2 mb-4">
                          <button onClick={() => addLayer('text')} className="flex-1 bg-gray-800 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 active:bg-gray-700">+ 文字</button>
                          <button onClick={() => logoInputRef.current.click()} className="flex-1 bg-gray-800 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 active:bg-gray-700">+ 图片</button>
                          <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" multiple className="hidden" />
                      </div>
                      <div className="space-y-2">
                          {layers.slice().reverse().map((layer) => (
                              <div key={layer.id} onClick={() => setActiveLayerId(layer.id)} className={`flex items-center p-3 rounded-lg border ${layer.id === activeLayerId ? 'border-blue-500 bg-blue-900/20' : 'border-gray-800 bg-gray-900'}`}>
                                  <span className="text-xs text-gray-400 w-8">{layer.type === 'text' ? 'T' : 'Img'}</span>
                                  <span className="flex-1 text-sm truncate mr-2">{layer.type === 'image' ? (logoLibrary.find(l=>l.id===layer.logoId)?.name || 'Image') : layer.text}</span>
                                  <div className="flex gap-2">
                                      <button onClick={(e) => {e.stopPropagation(); updateLayer(layer.id, {visible: !layer.visible})}} className="text-gray-500">{layer.visible ? <Eye size={16}/> : <EyeOff size={16}/>}</button>
                                      <button onClick={(e) => duplicateLayer(layer.id, e)} className="text-gray-500"><Copy size={16}/></button>
                                      <button onClick={(e) => removeLayer(layer.id, e)} className="text-gray-500 hover:text-red-400"><Trash2 size={16}/></button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              {/* Tab 2: 内容编辑 */}
              {activeTab === 'content' && activeLayer && (
                  <div className="space-y-5">
                      {activeLayer.type === 'text' ? (
                          <>
                            <div className="space-y-2">
                                <label className="text-xs text-gray-500 font-bold">文本内容</label>
                                <input type="text" value={activeLayer.text} onChange={e => updateLayer(activeLayer.id, {text: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none" />
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1 space-y-2">
                                    <label className="text-xs text-gray-500 font-bold">字体颜色</label>
                                    <div className="flex items-center gap-2 bg-gray-800 p-2 rounded-lg">
                                        <input type="color" value={activeLayer.textColor} onChange={e => updateLayer(activeLayer.id, {textColor: e.target.value})} className="w-8 h-8 rounded border-none bg-transparent"/>
                                        <span className="text-xs text-gray-400">{activeLayer.textColor}</span>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-2">
                                    <label className="text-xs text-gray-500 font-bold">样式</label>
                                    <div className="flex gap-1 h-12">
                                        <button onClick={()=>updateLayer(activeLayer.id, {isBold: !activeLayer.isBold})} className={`flex-1 rounded border border-gray-700 ${activeLayer.isBold ? 'bg-gray-700' : 'bg-gray-800'}`}><Bold size={16} className="mx-auto"/></button>
                                        <button onClick={()=>updateLayer(activeLayer.id, {isItalic: !activeLayer.isItalic})} className={`flex-1 rounded border border-gray-700 ${activeLayer.isItalic ? 'bg-gray-700' : 'bg-gray-800'}`}><Italic size={16} className="mx-auto"/></button>
                                    </div>
                                </div>
                            </div>
                          </>
                      ) : (
                          <div className="grid grid-cols-4 gap-2">
                              {logoLibrary.map(logo => (
                                  <div key={logo.id} onClick={() => updateLayer(activeLayer.id, {logoId: logo.id})} className={`aspect-square rounded border-2 bg-gray-800 p-1 ${activeLayer.logoId === logo.id ? 'border-blue-500' : 'border-transparent'}`}>
                                      <img src={logo.src} className="w-full h-full object-contain" alt=""/>
                                  </div>
                              ))}
                              <div onClick={() => logoInputRef.current.click()} className="aspect-square rounded border border-dashed border-gray-600 flex items-center justify-center text-gray-500"><Plus size={20}/></div>
                          </div>
                      )}
                      
                      {/* 混合模式放在这里 */}
                      <div className="space-y-2">
                           <div className="flex justify-between items-center"><label className="text-xs text-gray-500 font-bold">混合模式</label><SyncButton propKey="blendMode" value={activeLayer.blendMode}/></div>
                           <div className="flex flex-wrap gap-2">
                               {BLEND_MODES.slice(0, 4).map(m => (
                                   <button key={m.value} onClick={() => updateLayer(activeLayer.id, {blendMode: m.value})} className={`px-3 py-1.5 rounded text-xs ${activeLayer.blendMode === m.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>{m.label}</button>
                               ))}
                           </div>
                      </div>
                  </div>
              )}

              {/* Tab 3: 样式与调整 */}
              {activeTab === 'style' && activeLayer && (
                  <div className="space-y-6 pt-2">
                      {/* 大小 */}
                      <div className="space-y-2">
                          <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-500 font-bold">大小 ({Math.round(activeLayer.size)})</span>
                              <SyncButton propKey="size" value={activeLayer.size}/>
                          </div>
                          <input type="range" min="10" max="1000" step="1" value={Math.min(1000, activeLayer.size)} onChange={e => updateLayer(activeLayer.id, {size: Number(e.target.value)})} className="w-full h-2 bg-gray-800 rounded-lg appearance-none accent-blue-500"/>
                      </div>

                      {/* 透明度 */}
                      <div className="space-y-2">
                          <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-500 font-bold">不透明度 ({Math.round(activeLayer.opacity*100)}%)</span>
                              <SyncButton propKey="opacity" value={activeLayer.opacity}/>
                          </div>
                          <input type="range" min="0" max="1" step="0.01" value={activeLayer.opacity} onChange={e => updateLayer(activeLayer.id, {opacity: Number(e.target.value)})} className="w-full h-2 bg-gray-800 rounded-lg appearance-none accent-blue-500"/>
                      </div>

                      {/* 旋转 */}
                      <div className="space-y-2">
                          <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-500 font-bold">旋转 ({activeLayer.rotation}°)</span>
                              <SyncButton propKey="rotation" value={activeLayer.rotation}/>
                          </div>
                          <input type="range" min="0" max="360" step="1" value={activeLayer.rotation} onChange={e => updateLayer(activeLayer.id, {rotation: Number(e.target.value)})} className="w-full h-2 bg-gray-800 rounded-lg appearance-none accent-blue-500"/>
                      </div>

                      {/* 平铺开关 */}
                      <div className="flex items-center justify-between border-t border-gray-800 pt-4">
                          <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-400">全屏平铺模式</span>
                              <SyncButton propKey="isTiled" value={activeLayer.isTiled}/>
                          </div>
                          <button onClick={() => updateLayer(activeLayer.id, {isTiled: !activeLayer.isTiled})} className={`w-12 h-6 rounded-full relative transition-colors ${activeLayer.isTiled ? 'bg-blue-600' : 'bg-gray-700'}`}>
                              <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${activeLayer.isTiled ? 'translate-x-6' : 'translate-x-0'}`}/>
                          </button>
                      </div>
                      
                      {activeLayer.isTiled && (
                          <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                  <span className="text-xs text-gray-500 font-bold">平铺密度</span>
                                  <SyncButton propKey="tileDensity" value={activeLayer.tileDensity}/>
                              </div>
                              <input type="range" min="10" max="150" value={activeLayer.tileDensity} onChange={e => updateLayer(activeLayer.id, {tileDensity: Number(e.target.value)})} className="w-full h-2 bg-gray-800 rounded-lg appearance-none accent-blue-500"/>
                          </div>
                      )}
                  </div>
              )}
          </div>
      </div>
      
      <style>{`
        .pb-safe-area { padding-bottom: env(safe-area-inset-bottom); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default WatermarkApp;