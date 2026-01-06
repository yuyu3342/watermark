import React, { useState, useRef, useEffect } from 'react';
import { Upload, Type, Download, Image as ImageIcon, X, Layers, Grid3X3, Bold, Italic, Type as TypeIcon, Settings2, Blend, Plus, Trash2, CheckCircle2, Check, MousePointer2, Copy, Eye, EyeOff, LayoutTemplate } from 'lucide-react';

// 默认图层配置生成器
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

  // --- 多图层状态管理 ---
  const [layers, setLayers] = useState([createLayer('text')]); // 默认一个文字图层
  const [activeLayerId, setActiveLayerId] = useState(null); // 当前选中的图层ID

  // 确保初始化时选中第一个图层
  useEffect(() => {
    if (layers.length > 0 && !activeLayerId) {
      setActiveLayerId(layers[0].id);
    }
  }, [layers]);

  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];

  // --- Logo 库 ---
  const [logoLibrary, setLogoLibrary] = useState([]); 

  // Refs
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);

  // --- 常量 ---
  const BLEND_MODES = [
    { value: 'source-over', label: '正常 (Normal)' },
    { value: 'multiply', label: '正片叠底 (Multiply)' },
    { value: 'screen', label: '滤色 (Screen)' },
    { value: 'overlay', label: '叠加 (Overlay)' },
    { value: 'soft-light', label: '柔光 (Soft Light)' },
    { value: 'hard-light', label: '强光 (Hard Light)' },
    { value: 'color-dodge', label: '颜色减淡 (Dodge)' },
    { value: 'difference', label: '差值 (Difference)' },
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

  // --- 图层操作逻辑 ---

  const updateLayer = (id, updates) => {
    setLayers(prev => prev.map(layer => 
      layer.id === id ? { ...layer, ...updates } : layer
    ));
  };

  const updateAllLayers = (updates) => {
    if(window.confirm("确定要将此设置应用到所有图层吗？")) {
       setLayers(prev => prev.map(layer => ({ ...layer, ...updates })));
    }
  };

  const addLayer = (type, logoId = null) => {
    const newLayer = createLayer(type, logoId);
    // 稍微错开位置以免重叠看不见
    newLayer.posX = 50 + (layers.length * 5); 
    newLayer.posY = 50 + (layers.length * 5);
    setLayers([...layers, newLayer]);
    setActiveLayerId(newLayer.id);
  };

  const removeLayer = (id, e) => {
    e.stopPropagation();
    if (layers.length <= 1) {
      alert("至少保留一个水印图层");
      return;
    }
    const newLayers = layers.filter(l => l.id !== id);
    setLayers(newLayers);
    if (activeLayerId === id) {
      setActiveLayerId(newLayers[newLayers.length - 1].id);
    }
  };

  const duplicateLayer = (id, e) => {
    e.stopPropagation();
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

  // --- 图片/Logo 上传逻辑 ---

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
          const newLogo = {
             id: Date.now() + Math.random(),
             src: event.target.result,
             imgObject: img,
             name: file.name
          };
          setLogoLibrary(prev => [...prev, newLogo]);
          // 上传 Logo 后自动添加一个该 Logo 的图层
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

    if (index === selectedIndex) {
        setSelectedIndex(0);
    } else if (index < selectedIndex) {
        setSelectedIndex(selectedIndex - 1);
    }
  };

  const toggleSelection = (id, e) => {
      e.stopPropagation();
      const newIds = new Set(selectedIds);
      if (newIds.has(id)) {
          newIds.delete(id);
      } else {
          newIds.add(id);
      }
      setSelectedIds(newIds);
  };

  const selectAll = () => {
      if (selectedIds.size === imageList.length) {
          setSelectedIds(new Set()); 
      } else {
          setSelectedIds(new Set(imageList.map(img => img.id)));
      }
  };

  // 鼠标滚轮 - 作用于当前选中的 activeLayer
  const handleWheel = (e) => {
      if (!activeLayer) return;

      if (e.shiftKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -5 : 5;
          const nextRot = activeLayer.rotation + delta;
          const finalRot = nextRot > 360 ? 0 : (nextRot < 0 ? 360 : nextRot);
          updateLayer(activeLayer.id, { rotation: finalRot });
      } else {
          e.preventDefault();
          const step = Math.max(5, activeLayer.size * 0.05); 
          const delta = e.deltaY > 0 ? -step : step;
          const nextSize = Math.max(1, Math.min(10000, activeLayer.size + delta));
          updateLayer(activeLayer.id, { size: nextSize });
      }
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

    // 1. 绘制底图
    ctx.drawImage(image, 0, 0);

    // 2. 循环绘制所有图层 (按照数组顺序，后面的在上面)
    layers.forEach(layer => {
        if (layer.visible) {
            renderSingleLayer(ctx, canvas.width, canvas.height, layer);
        }
    });

  }, [imageList, selectedIndex, layers, logoLibrary]);

  const renderSingleLayer = (ctx, width, height, layer) => {
    // 如果是图片类型但没有有效 logoId，跳过
    let logoImg = null;
    if (layer.type === 'image') {
        const logoData = logoLibrary.find(l => l.id === layer.logoId);
        if (logoData) logoImg = logoData.imgObject;
        else return; // 找不到对应图片资源，不绘制
    }

    ctx.save();
    ctx.globalAlpha = layer.opacity;
    
    let contentWidth, contentHeight;
    
    // 尺寸计算
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
                if ((Math.floor(y / gapY) % 2) !== 0) {
                     ctx.translate(gapX / 2, 0);
                }
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

  // --- 导出逻辑 (未变动，略作适配) ---

  const handleDownloadCurrent = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `watermarked_${imageList[selectedIndex].file.name}`;
    link.href = canvasRef.current.toDataURL('image/png', 1.0);
    link.click();
  };

  const handleBatchDownload = async () => {
    if (!window.JSZip || imageList.length === 0) return;
    
    const targets = selectedIds.size > 0 
        ? imageList.filter(img => selectedIds.has(img.id))
        : imageList;

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
        // 渲染所有图层
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
    link.download = targets.length === 1 
        ? `watermarked_${targets[0].file.name}.zip` 
        : `batch_watermarks_${targets.length}.zip`;
    link.click();
    setIsProcessing(false);
    setDownloadProgress(0);
  };

  // --- UI 组件 ---
  
  const PresetGrid = () => (
    <div className="grid grid-cols-3 gap-1.5 w-full max-w-[140px]">
      {[
        { x: 10, y: 10 }, { x: 50, y: 10 }, { x: 90, y: 10 },
        { x: 10, y: 50 }, { x: 50, y: 50 }, { x: 90, y: 50 },
        { x: 10, y: 90 }, { x: 50, y: 90 }, { x: 90, y: 90 },
      ].map((pos, i) => (
        <button
          key={i}
          onClick={() => { 
              if (activeLayer) updateLayer(activeLayer.id, { posX: pos.x, posY: pos.y, isTiled: false });
          }}
          className={`h-6 rounded border transition-colors ${
            activeLayer && !activeLayer.isTiled && Math.abs(activeLayer.posX - pos.x) < 5 && Math.abs(activeLayer.posY - pos.y) < 5
              ? 'bg-blue-500 border-blue-600'
              : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
          }`}
        />
      ))}
    </div>
  );

  // 辅助组件：属性旁边的"应用到所有"按钮
  const SyncButton = ({ propKey, value }) => (
    <button 
        onClick={() => updateAllLayers({ [propKey]: value })}
        title="将当前值应用到所有图层"
        className="text-gray-600 hover:text-blue-400 p-1 rounded hover:bg-gray-800 transition-colors"
    >
        <Copy size={12} />
    </button>
  );

  if (imageList.length === 0) {
     // ... (保持原有的欢迎界面逻辑不变，为了节省长度这里简写，实际代码请保留原有的 return)
     return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="text-center max-w-md w-full animate-fade-in z-10">
          <div className="mb-6 flex justify-center">
            <div className="bg-gradient-to-tr from-blue-500 to-purple-600 p-5 rounded-2xl shadow-xl shadow-blue-900/20">
              <Layers size={56} className="text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-3 tracking-tight">水印大师 <span className="text-blue-400 text-lg align-top font-normal border border-blue-500/30 px-2 py-0.5 rounded-full bg-blue-500/10">Multi-Layer</span></h1>
          <p className="text-gray-400 mb-10 text-lg">
             多图层混合 · 自由调节 · 批量导出
          </p>
          <button 
            onClick={() => fileInputRef.current.click()}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-lg font-semibold py-4 px-6 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center justify-center gap-3 group"
          >
            <Upload size={24} className="group-hover:-translate-y-1 transition-transform" />
            开始使用 (支持批量)
          </button>
          <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col md:flex-row text-white overflow-hidden font-sans">
      
      {/* --- 左侧侧边栏：图层与设置 --- */}
      <div className="order-2 md:order-1 w-full md:w-80 bg-[#121214] border-r border-gray-800 flex flex-col h-[45vh] md:h-screen z-20 shadow-xl">
        
        {/* 1. 图层管理器 */}
        <div className="flex-shrink-0 border-b border-gray-800 bg-[#1a1a1c]">
            <div className="p-3 flex justify-between items-center border-b border-gray-800/50">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <Layers size={14} /> 图层管理 ({layers.length})
                </h3>
                <div className="flex gap-1">
                    <button onClick={() => addLayer('text')} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="添加文字"><TypeIcon size={14}/></button>
                    <button onClick={() => logoInputRef.current.click()} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="添加图片"><ImageIcon size={14}/></button>
                    <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" multiple className="hidden" />
                </div>
            </div>
            
            <div className="max-h-40 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {layers.slice().reverse().map((layer, index) => {
                    // slice().reverse() 只是为了显示顺序（通常图层列表上面的是最顶层），但真实渲染顺序是数组正序
                    const realIndex = layers.length - 1 - index;
                    const isActive = layer.id === activeLayerId;
                    return (
                        <div 
                            key={layer.id}
                            onClick={() => setActiveLayerId(layer.id)}
                            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm transition-colors group ${
                                isActive ? 'bg-blue-600/20 border border-blue-500/50' : 'hover:bg-gray-800 border border-transparent'
                            }`}
                        >
                            <button 
                                onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}
                                className={`text-gray-400 hover:text-white ${!layer.visible && 'opacity-50'}`}
                            >
                                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                            
                            <span className="flex-1 truncate select-none">
                                {layer.type === 'image' 
                                    ? (logoLibrary.find(l=>l.id===layer.logoId)?.name || '未选图片') 
                                    : (layer.text || '空文字')}
                            </span>
                            
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => duplicateLayer(layer.id, e)} className="p-1 hover:bg-blue-500/30 rounded text-gray-400 hover:text-blue-300"><Copy size={12}/></button>
                                <button onClick={(e) => removeLayer(layer.id, e)} className="p-1 hover:bg-red-500/30 rounded text-gray-400 hover:text-red-300"><Trash2 size={12}/></button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* 2. 参数设置面板 (针对 Active Layer) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-7 custom-scrollbar bg-[#121214]">
            {activeLayer ? (
                <>
                    {/* 类型指示器 */}
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-[-10px]">
                        正在编辑: {activeLayer.type === 'text' ? '文字图层' : '图片图层'}
                    </div>

                    {/* 具体内容设置 */}
                    <div className="space-y-4">
                        {activeLayer.type === 'text' ? (
                            <>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">文字内容</label>
                                    <input
                                        type="text"
                                        value={activeLayer.text}
                                        onChange={(e) => updateLayer(activeLayer.id, { text: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">颜色</label>
                                        <div className="flex items-center gap-2 bg-gray-900 p-2 rounded-lg border border-gray-700">
                                            <input type="color" value={activeLayer.textColor} onChange={(e) => updateLayer(activeLayer.id, { textColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none"/>
                                            <span className="text-xs font-mono text-gray-400">{activeLayer.textColor}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">样式</label>
                                        <div className="flex gap-1">
                                            <button onClick={()=>updateLayer(activeLayer.id, { isBold: !activeLayer.isBold })} className={`flex-1 h-10 rounded-lg border border-gray-700 flex items-center justify-center ${activeLayer.isBold ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-500'}`}><Bold size={16}/></button>
                                            <button onClick={()=>updateLayer(activeLayer.id, { isItalic: !activeLayer.isItalic })} className={`flex-1 h-10 rounded-lg border border-gray-700 flex items-center justify-center ${activeLayer.isItalic ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-500'}`}><Italic size={16}/></button>
                                        </div>
                                    </div>
                                </div>
                                {/* 描边设置 */}
                                <div className="space-y-2 pt-2 border-t border-gray-800">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">描边强度</label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">{activeLayer.strokeWidth}</span>
                                            <SyncButton propKey="strokeWidth" value={activeLayer.strokeWidth} />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 items-center">
                                        <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-600 flex-shrink-0">
                                            <input type="color" value={activeLayer.strokeColor} onChange={(e) => updateLayer(activeLayer.id, { strokeColor: e.target.value })} className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer p-0 m-0"/>
                                        </div>
                                        <input type="range" min="0" max="20" value={activeLayer.strokeWidth} onChange={(e) => updateLayer(activeLayer.id, { strokeWidth: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">选择图片素材</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {logoLibrary.map(logo => (
                                        <div 
                                            key={logo.id}
                                            onClick={() => updateLayer(activeLayer.id, { logoId: logo.id })}
                                            className={`relative aspect-square rounded-lg border-2 overflow-hidden cursor-pointer bg-[#1a1a1c] flex items-center justify-center group ${activeLayer.logoId === logo.id ? 'border-blue-500' : 'border-gray-700 hover:border-gray-500'}`}
                                        >
                                            <img src={logo.src} className="max-w-[80%] max-h-[80%] object-contain" alt="" />
                                        </div>
                                    ))}
                                    <button 
                                        onClick={() => logoInputRef.current.click()}
                                        className="aspect-square rounded-lg border-2 border-dashed border-gray-700 hover:border-blue-500 hover:bg-gray-800 flex items-center justify-center text-gray-500 transition-all"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 通用变换设置 (每个都有"应用到所有"按钮) */}
                    <div className="space-y-5 border-t border-gray-800 pt-5">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                                <span className="flex items-center gap-2"><Blend size={12} /> 混合模式</span>
                                <SyncButton propKey="blendMode" value={activeLayer.blendMode} />
                            </label>
                            <select 
                                value={activeLayer.blendMode} 
                                onChange={(e) => updateLayer(activeLayer.id, { blendMode: e.target.value })}
                                className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg p-2.5 outline-none"
                            >
                                {BLEND_MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                                <span>大小</span> 
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="number" 
                                        value={Math.round(activeLayer.size)} 
                                        onChange={(e) => updateLayer(activeLayer.id, { size: Number(e.target.value) })}
                                        className="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-right text-xs outline-none"
                                    />
                                    <SyncButton propKey="size" value={activeLayer.size} />
                                </div>
                            </label>
                            <input 
                                type="range" min="1" max="2000" step="1"
                                value={Math.min(2000, activeLayer.size)} 
                                onChange={(e) => updateLayer(activeLayer.id, { size: parseInt(e.target.value) })} 
                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between">
                                <span>不透明度</span> 
                                <SyncButton propKey="opacity" value={activeLayer.opacity} />
                            </label>
                            <input 
                                type="range" min="0" max="1" step="0.01" 
                                value={activeLayer.opacity} 
                                onChange={(e) => updateLayer(activeLayer.id, { opacity: parseFloat(e.target.value) })} 
                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between">
                                <span>旋转 ({activeLayer.rotation}°)</span> 
                                <SyncButton propKey="rotation" value={activeLayer.rotation} />
                            </label>
                            <input 
                                type="range" min="0" max="360" 
                                value={activeLayer.rotation} 
                                onChange={(e) => updateLayer(activeLayer.id, { rotation: parseInt(e.target.value) })} 
                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                    </div>

                    {/* 布局模式 */}
                    <div className="space-y-4 border-t border-gray-800 pt-5">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <Grid3X3 size={14} /> 平铺模式
                            </label>
                            <div className="flex items-center gap-2">
                                <SyncButton propKey="isTiled" value={activeLayer.isTiled} />
                                <button 
                                    onClick={() => updateLayer(activeLayer.id, { isTiled: !activeLayer.isTiled })}
                                    className={`w-11 h-6 rounded-full transition-colors relative ${activeLayer.isTiled ? 'bg-blue-600' : 'bg-gray-700'}`}
                                >
                                    <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${activeLayer.isTiled ? 'translate-x-5' : 'translate-x-0'}`}></span>
                                </button>
                            </div>
                        </div>

                        {activeLayer.isTiled ? (
                            <div className="bg-gray-900/50 p-3 rounded-lg space-y-2">
                                <label className="text-xs text-gray-500 flex justify-between">
                                    <span>间隙</span>
                                    <SyncButton propKey="tileDensity" value={activeLayer.tileDensity} />
                                </label>
                                <input type="range" min="10" max="150" value={activeLayer.tileDensity} onChange={(e) => updateLayer(activeLayer.id, { tileDensity: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                            </div>
                        ) : (
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-2">
                                    <label className="text-xs text-gray-500 block mb-1">九宫格</label>
                                    <PresetGrid />
                                </div>
                                <div className="flex-1 space-y-4 pt-1">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-gray-600 uppercase flex justify-between">X <SyncButton propKey="posX" value={activeLayer.posX}/></label>
                                        <input type="range" min="0" max="100" value={activeLayer.posX} onChange={(e)=>updateLayer(activeLayer.id, { posX: parseInt(e.target.value) })} className="w-full h-1 bg-gray-700 accent-gray-400"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-gray-600 uppercase flex justify-between">Y <SyncButton propKey="posY" value={activeLayer.posY}/></label>
                                        <input type="range" min="0" max="100" value={activeLayer.posY} onChange={(e)=>updateLayer(activeLayer.id, { posY: parseInt(e.target.value) })} className="w-full h-1 bg-gray-700 accent-gray-400"/>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="text-center text-gray-500 mt-10">
                    请选择一个图层进行编辑
                </div>
            )}
            
            <div className="pt-6 pb-12 md:pb-0">
                <button 
                onClick={() => fileInputRef.current.click()}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-300 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
                >
                <Upload size={16} /> 继续添加照片
                </button>
            </div>
        </div>
      </div>

      {/* --- 右侧工作区 (保持大体不变，微调标题) --- */}
      <div className="order-1 md:order-2 flex-1 bg-black/95 relative flex flex-col h-[55vh] md:h-screen">
        <div className="h-16 bg-[#121214] border-b border-gray-800 flex items-center justify-between px-6 shadow-sm z-10">
             {/* ... Top bar 保持一致 ... */}
             <div className="flex items-center gap-4 overflow-hidden">
                 <div className="text-sm font-medium text-gray-300 flex-shrink-0">
                    <span className="text-blue-500 font-bold text-lg mr-1">{selectedIndex + 1}</span>
                    <span className="text-gray-600">/ {imageList.length}</span>
                 </div>
                 <div className="h-4 w-[1px] bg-gray-700 flex-shrink-0"></div>
                 <div className="flex gap-2">
                     <button 
                        onClick={selectAll}
                        className={`text-xs px-2 py-1 rounded border transition-all ${
                            selectedIds.size === imageList.length && imageList.length > 0
                            ? 'bg-blue-900/30 border-blue-500 text-blue-400' 
                            : 'border-gray-700 text-gray-400 hover:text-gray-200'
                        }`}
                     >
                        {selectedIds.size === imageList.length ? '取消全选' : '全选'}
                     </button>
                     {selectedIds.size > 0 && (
                        <span className="text-xs px-2 py-1 bg-blue-600 text-white rounded font-bold">
                            已选 {selectedIds.size} 张
                        </span>
                     )}
                 </div>
            </div>
            
            <div className="flex gap-3">
                <button onClick={handleDownloadCurrent} className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all border border-gray-700">
                    <Download size={16} /> <span className="hidden sm:inline">下载当前</span>
                </button>
                <button 
                    onClick={handleBatchDownload}
                    disabled={isProcessing || !isZipLoaded}
                    className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20 ${
                        isProcessing 
                        ? 'bg-blue-900/50 text-blue-200 cursor-wait' 
                        : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105 active:scale-95'
                    }`}
                >
                    {isProcessing ? (
                        <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>{downloadProgress}%</div>
                    ) : (
                        <><Layers size={16} /> {selectedIds.size > 0 ? `批量导出 (${selectedIds.size})` : `批量导出全部 (${imageList.length})`}</>
                    )}
                </button>
            </div>
        </div>

        <div 
            ref={canvasContainerRef}
            className="flex-1 relative overflow-hidden flex items-center justify-center p-4 md:p-10 bg-[#0a0a0a]"
            onWheel={handleWheel} 
        >
             {/* 背景格和 Canvas 保持不变 */}
             <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                backgroundImage: 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)',
                backgroundSize: '24px 24px',
                backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px'
            }}></div>
            <div className="absolute top-4 left-4 z-20 pointer-events-none opacity-50 text-xs text-gray-500 flex flex-col gap-1">
                 <span className="flex items-center gap-1"><MousePointer2 size={12}/> 滚轮缩放选中图层</span>
                 <span className="flex items-center gap-1"><MousePointer2 size={12}/> Shift+滚轮旋转</span>
            </div>
            <div className="relative shadow-2xl z-0 max-w-full max-h-full flex flex-col items-center">
                <canvas
                    ref={canvasRef}
                    className="max-w-full max-h-full object-contain mx-auto rounded shadow-black/50"
                    style={{ maxHeight: 'calc(100vh - 240px)' }}
                />
            </div>
        </div>

        {/* 底部缩略图保持不变 */}
        <div className="h-24 bg-[#121214] border-t border-gray-800 flex items-center px-4 gap-3 overflow-x-auto custom-scrollbar z-10">
            {imageList.map((img, idx) => {
                const isSelected = selectedIds.has(img.id);
                const isActive = idx === selectedIndex;
                return (
                    <div 
                        key={img.id}
                        onClick={() => setSelectedIndex(idx)}
                        className={`relative flex-shrink-0 h-16 w-16 rounded-lg overflow-hidden cursor-pointer border-2 transition-all group ${
                            isActive ? 'border-blue-500 ring-2 ring-blue-500/20 z-10' : 'border-gray-700 hover:border-gray-500'
                        } ${isSelected ? 'ring-2 ring-green-500/50' : ''}`}
                    >
                        <img src={img.src} className={`w-full h-full object-cover transition-opacity ${isSelected ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`} alt="" />
                        <div 
                            onClick={(e) => toggleSelection(img.id, e)}
                            className="absolute top-0.5 left-0.5 z-20 p-1 rounded-full hover:bg-black/40 transition-colors"
                        >
                            {isSelected ? <CheckCircle2 size={16} className="text-green-500 bg-white rounded-full" /> : <div className="w-4 h-4 rounded-full border-2 border-gray-300/70 bg-black/20 hover:border-white"></div>}
                        </div>
                        <button onClick={(e) => removeImage(idx, e)} className="absolute top-0 right-0 bg-black/60 text-white rounded-bl-md p-1 opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all backdrop-blur-sm z-20"><X size={10} /></button>
                    </div>
                );
            })}
            <button onClick={() => fileInputRef.current.click()} className="flex-shrink-0 h-16 w-16 rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-gray-500 hover:bg-gray-800 transition-all"><Upload size={16} /><span className="text-[10px] mt-1 font-medium">加图</span></button>
        </div>

      </div>
    </div>
  );
};

export default WatermarkApp;