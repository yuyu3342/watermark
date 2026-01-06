import React, { useState, useRef, useEffect } from 'react';
import { Upload, Type, Move, Download, RotateCw, Palette, Image as ImageIcon, X, Smartphone, Monitor, LayoutGrid, Layers, Archive, Grid3X3, Bold, Italic, Type as TypeIcon, Copy, Settings2, Blend, Plus, Trash2 } from 'lucide-react';

const WatermarkApp = () => {
  // --- Core State ---
  const [imageList, setImageList] = useState([]); 
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isZipLoaded, setIsZipLoaded] = useState(false);

  // --- Watermark Configuration ---
  const [watermarkType, setWatermarkType] = useState('text'); // 'text' | 'image'
  const [blendMode, setBlendMode] = useState('source-over'); // New: Blend Modes
  
  // Text Mode Settings
  const [text, setText] = useState('@我的版权水印');
  const [textColor, setTextColor] = useState('#ffffff');
  const [isBold, setIsBold] = useState(true);
  const [isItalic, setIsItalic] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(2); // 0-10
  const [strokeColor, setStrokeColor] = useState('#000000');

  // Image Mode Settings (Logo Library)
  const [logoLibrary, setLogoLibrary] = useState([]); // Array of { id, src, imgObject, name }
  const [activeLogoId, setActiveLogoId] = useState(null); // Currently selected logo ID

  // Common Settings
  const [size, setSize] = useState(40); // Font size or Image Scale
  const [opacity, setOpacity] = useState(0.8);
  const [rotation, setRotation] = useState(0);
  
  // Positioning
  const [isTiled, setIsTiled] = useState(false); // Pattern mode
  const [tileDensity, setTileDensity] = useState(50); // Gap between tiles
  const [posX, setPosX] = useState(50); // Single position X
  const [posY, setPosY] = useState(50); // Single position Y

  // Refs
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);

  // --- Constants ---
  const BLEND_MODES = [
    { value: 'source-over', label: '正常 (Normal)' },
    { value: 'multiply', label: '正片叠底 (Multiply)' },
    { value: 'screen', label: '滤色 (Screen)' },
    { value: 'overlay', label: '叠加 (Overlay)' },
    { value: 'soft-light', label: '柔光 (Soft Light)' },
    { value: 'hard-light', label: '强光 (Hard Light)' },
    { value: 'color-dodge', label: '颜色减淡 (Dodge)' },
    { value: 'color-burn', label: '颜色加深 (Burn)' },
    { value: 'difference', label: '差值 (Difference)' },
    { value: 'exclusion', label: '排除 (Exclusion)' },
  ];

  // --- Initialization ---
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

  // --- Handlers ---

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
          // If this is the first logo or we want to switch to it immediately
          if (!activeLogoId) {
             setActiveLogoId(newLogo.id);
          } else {
             setActiveLogoId(newLogo.id); // Auto switch to newly added
          }
          setWatermarkType('image'); 
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
    // Reset input so same files can be selected again if needed
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const deleteLogo = (id, e) => {
      e.stopPropagation();
      const newLib = logoLibrary.filter(l => l.id !== id);
      setLogoLibrary(newLib);
      if (activeLogoId === id) {
          setActiveLogoId(newLib.length > 0 ? newLib[0].id : null);
      }
  };

  const removeImage = (index, e) => {
    e.stopPropagation();
    const newList = imageList.filter((_, i) => i !== index);
    setImageList(newList);
    if (index === selectedIndex) {
        setSelectedIndex(0);
    } else if (index < selectedIndex) {
        setSelectedIndex(selectedIndex - 1);
    }
  };

  // --- Drawing Logic ---

  useEffect(() => {
    const currentImgData = imageList[selectedIndex];
    if (!currentImgData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const image = currentImgData.imgObject;

    canvas.width = image.width;
    canvas.height = image.height;

    ctx.drawImage(image, 0, 0);

    renderWatermarkLayer(ctx, canvas.width, canvas.height);

  }, [
    imageList, selectedIndex, 
    watermarkType, text, textColor, isBold, isItalic, strokeWidth, strokeColor, 
    logoLibrary, activeLogoId, // Updated dependencies
    size, opacity, rotation, isTiled, tileDensity, posX, posY,
    blendMode // Updated dependency
  ]);

  const renderWatermarkLayer = (ctx, width, height) => {
    // Get Active Logo Object
    const activeLogo = logoLibrary.find(l => l.id === activeLogoId);

    if (watermarkType === 'image' && !activeLogo) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    
    // Note: globalCompositeOperation is applied inside drawSingle to affect the watermark vs background interaction
    
    const baseDim = Math.min(width, height); 
    
    let contentWidth, contentHeight;
    
    if (watermarkType === 'text') {
        const fontStyle = isItalic ? 'italic' : 'normal';
        const fontWeight = isBold ? 'bold' : 'normal';
        const calculatedFontSize = (width * (size / 1000)); 
        ctx.font = `${fontStyle} ${fontWeight} ${calculatedFontSize}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        
        const metrics = ctx.measureText(text);
        contentWidth = metrics.width;
        contentHeight = calculatedFontSize; 
    } else {
        const logoImg = activeLogo.imgObject;
        const scale = size / 200; 
        contentWidth = logoImg.width * scale;
        
        if (contentWidth > width * 0.8) {
             const ratio = (width * 0.8) / logoImg.width;
             contentWidth = width * 0.8;
             contentHeight = logoImg.height * ratio;
        } else {
            const ratio = contentWidth / logoImg.width;
            contentHeight = logoImg.height * ratio;
        }
    }

    const drawSingle = () => {
        // Apply Blend Mode HERE
        ctx.globalCompositeOperation = blendMode;

        if (watermarkType === 'text') {
            if (strokeWidth > 0) {
                ctx.lineWidth = (width * (strokeWidth / 1000));
                ctx.strokeStyle = strokeColor;
                ctx.lineJoin = 'round';
                ctx.strokeText(text, 0, 0);
            }
            ctx.fillStyle = textColor;
            // Shadow can interfere with blend modes sometimes, but usually fine
            ctx.shadowColor = "rgba(0,0,0,0.3)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.fillText(text, 0, 0);
        } else {
            const logoImg = activeLogo.imgObject;
            ctx.shadowColor = "rgba(0,0,0,0.3)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.drawImage(logoImg, -contentWidth/2, -contentHeight/2, contentWidth, contentHeight);
        }
        
        // Reset blend mode so it doesn't affect subsequent transforms/restores improperly (though save/restore usually handles context state)
        // However, since we are inside a loop in tiled mode, we want the blend mode to apply to each draw operation against the canvas.
    };

    if (isTiled) {
        const gapX = contentWidth + (width * (tileDensity / 300));
        const gapY = contentHeight + (height * (tileDensity / 300));
        const buffer = Math.max(width, height) * 0.5;
        
        for (let x = -buffer; x < width + buffer; x += gapX) {
            for (let y = -buffer; y < height + buffer; y += gapY) {
                ctx.save();
                ctx.translate(x, y);
                if ((Math.floor(y / gapY) % 2) !== 0) {
                     ctx.translate(gapX / 2, 0);
                }
                ctx.rotate((rotation * Math.PI) / 180);
                drawSingle();
                ctx.restore();
            }
        }
    } else {
        const x = (width * posX) / 100;
        const y = (height * posY) / 100;

        ctx.translate(x, y);
        ctx.rotate((rotation * Math.PI) / 180);
        drawSingle();
    }

    ctx.restore();
  };

  // --- Export ---

  const handleDownloadCurrent = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `watermarked_${imageList[selectedIndex].file.name}`;
    link.href = canvasRef.current.toDataURL('image/png', 1.0);
    link.click();
  };

  const handleBatchDownload = async () => {
    if (!window.JSZip || imageList.length === 0) return;
    
    setIsProcessing(true);
    setDownloadProgress(0);
    const zip = new window.JSZip();
    const folder = zip.folder("watermarked_images");

    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');

    for (let i = 0; i < imageList.length; i++) {
        const imgData = imageList[i];
        tempCanvas.width = imgData.width;
        tempCanvas.height = imgData.height;
        
        ctx.drawImage(imgData.imgObject, 0, 0);
        renderWatermarkLayer(ctx, imgData.width, imgData.height);
        
        const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
        folder.file(`watermarked_${imgData.file.name}`, blob);
        
        setDownloadProgress(Math.round(((i + 1) / imageList.length) * 100));
    }

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = "batch_watermarks.zip";
    link.click();
    
    setIsProcessing(false);
    setDownloadProgress(0);
  };

  // --- UI Components ---
  
  const PresetGrid = () => (
    <div className="grid grid-cols-3 gap-1.5 w-full max-w-[140px]">
      {[
        { x: 10, y: 10 }, { x: 50, y: 10 }, { x: 90, y: 10 },
        { x: 10, y: 50 }, { x: 50, y: 50 }, { x: 90, y: 50 },
        { x: 10, y: 90 }, { x: 50, y: 90 }, { x: 90, y: 90 },
      ].map((pos, i) => (
        <button
          key={i}
          onClick={() => { setPosX(pos.x); setPosY(pos.y); setIsTiled(false); }}
          className={`h-6 rounded border transition-colors ${
            !isTiled && Math.abs(posX - pos.x) < 5 && Math.abs(posY - pos.y) < 5
              ? 'bg-blue-500 border-blue-600'
              : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
          }`}
        />
      ))}
    </div>
  );

  // Landing Page
  if (imageList.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="text-center max-w-md w-full animate-fade-in z-10">
          <div className="mb-6 flex justify-center">
            <div className="bg-gradient-to-tr from-blue-500 to-purple-600 p-5 rounded-2xl shadow-xl shadow-blue-900/20">
              <Layers size={56} className="text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-3 tracking-tight">水印大师 <span className="text-blue-400 text-lg align-top font-normal border border-blue-500/30 px-2 py-0.5 rounded-full bg-blue-500/10">Ultimate</span></h1>
          <p className="text-gray-400 mb-10 text-lg">混合模式、Logo 库、批量处理。<br/>可能是最好用的 Web 水印工具。</p>
          
          <button 
            onClick={() => fileInputRef.current.click()}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-lg font-semibold py-4 px-6 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center justify-center gap-3 group"
          >
            <Upload size={24} className="group-hover:-translate-y-1 transition-transform" />
            开始批量加水印
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            accept="image/*" 
            multiple
            className="hidden" 
          />
          
          <div className="mt-8 flex justify-center gap-6 text-sm text-gray-500">
             <span className="flex items-center gap-1.5"><Blend size={14}/> 混合模式</span>
             <span className="flex items-center gap-1.5"><ImageIcon size={14}/> Logo库管理</span>
             <span className="flex items-center gap-1.5"><Settings2 size={14}/> 隐私安全</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col md:flex-row text-white overflow-hidden font-sans">
      
      {/* SIDEBAR */}
      <div className="order-2 md:order-1 w-full md:w-80 bg-[#121214] border-r border-gray-800 flex flex-col h-[45vh] md:h-screen z-20 shadow-xl">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#121214]">
          <h2 className="font-bold text-lg flex items-center gap-2 text-gray-200">
            <Settings2 size={18} className="text-blue-500" /> 
            参数调节
          </h2>
          <button onClick={() => setImageList([])} className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors">
            重置
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-7 custom-scrollbar">
          
          {/* 1. Mode Switcher */}
          <div className="bg-gray-800/50 p-1 rounded-lg flex text-sm font-medium">
            <button 
                onClick={() => setWatermarkType('text')}
                className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all ${watermarkType === 'text' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
                <TypeIcon size={14}/> 文字
            </button>
            <button 
                onClick={() => setWatermarkType('image')}
                className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all ${watermarkType === 'image' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
                <ImageIcon size={14}/> Logo
            </button>
          </div>

          {/* 2. Content Settings */}
          <div className="space-y-4">
             {watermarkType === 'text' ? (
                 <>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">内容</label>
                        <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                        placeholder="输入文字..."
                        />
                    </div>
                    {/* Font Styles */}
                    <div className="grid grid-cols-2 gap-3">
                         <div className="space-y-2">
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">颜色</label>
                             <div className="flex items-center gap-2 bg-gray-900 p-2 rounded-lg border border-gray-700">
                                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none"/>
                                <span className="text-xs font-mono text-gray-400">{textColor}</span>
                             </div>
                         </div>
                         <div className="space-y-2">
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">样式</label>
                             <div className="flex gap-1">
                                <button onClick={()=>setIsBold(!isBold)} className={`flex-1 h-10 rounded-lg border border-gray-700 flex items-center justify-center ${isBold ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-500'}`}><Bold size={16}/></button>
                                <button onClick={()=>setIsItalic(!isItalic)} className={`flex-1 h-10 rounded-lg border border-gray-700 flex items-center justify-center ${isItalic ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-500'}`}><Italic size={16}/></button>
                             </div>
                         </div>
                    </div>
                    {/* Stroke */}
                    <div className="space-y-2 pt-2 border-t border-gray-800">
                        <div className="flex justify-between">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">描边</label>
                            <span className="text-xs text-gray-500">{strokeWidth}</span>
                        </div>
                        <div className="flex gap-3 items-center">
                             <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-600 flex-shrink-0">
                                <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer p-0 m-0"/>
                             </div>
                             <input type="range" min="0" max="20" value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                        </div>
                    </div>
                 </>
             ) : (
                 <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Logo 库</label>
                        <button 
                            onClick={() => logoInputRef.current.click()}
                            className="text-[10px] bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                        >
                            <Plus size={12}/> 添加
                        </button>
                    </div>
                    
                    {/* Logo Grid */}
                    {logoLibrary.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2">
                            {logoLibrary.map(logo => (
                                <div 
                                    key={logo.id}
                                    onClick={() => setActiveLogoId(logo.id)}
                                    className={`relative aspect-square rounded-lg border-2 overflow-hidden cursor-pointer bg-[#1a1a1c] flex items-center justify-center group ${activeLogoId === logo.id ? 'border-blue-500' : 'border-gray-700 hover:border-gray-500'}`}
                                >
                                    <img src={logo.src} className="max-w-[80%] max-h-[80%] object-contain" />
                                    <button 
                                        onClick={(e) => deleteLogo(logo.id, e)}
                                        className="absolute top-0 right-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            ))}
                            {/* Add Button in Grid */}
                            <button 
                                onClick={() => logoInputRef.current.click()}
                                className="aspect-square rounded-lg border-2 border-dashed border-gray-700 hover:border-blue-500 hover:bg-gray-800 flex items-center justify-center text-gray-500 transition-all"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                    ) : (
                        <button 
                            onClick={() => logoInputRef.current.click()}
                            className="w-full py-6 border-2 border-dashed border-gray-700 rounded-lg hover:border-blue-500 hover:bg-gray-800/50 transition-all flex flex-col items-center gap-2 text-gray-400"
                        >
                            <Upload size={20} />
                            <span className="text-xs">点击导入 Logo (支持多选)</span>
                        </button>
                    )}
                    
                    <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" multiple className="hidden" />
                 </div>
             )}
          </div>

          {/* 3. Blend & Transform */}
          <div className="space-y-5 border-t border-gray-800 pt-5">
             {/* Blend Mode */}
             <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <Blend size={12} /> 混合模式 (Blend Mode)
                </label>
                <select 
                    value={blendMode} 
                    onChange={(e) => setBlendMode(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                    {BLEND_MODES.map(mode => (
                        <option key={mode.value} value={mode.value}>{mode.label}</option>
                    ))}
                </select>
             </div>

             {/* Size & Opacity */}
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">大小</label>
                    <input type="range" min="10" max="200" value={size} onChange={(e) => setSize(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">不透明度</label>
                    <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                </div>
             </div>

             {/* Rotation */}
             <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between">
                    <span>旋转</span> <span>{rotation}°</span>
                </label>
                <input type="range" min="0" max="360" value={rotation} onChange={(e) => setRotation(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
             </div>
          </div>

          {/* 4. Layout Mode */}
          <div className="space-y-4 border-t border-gray-800 pt-5">
             <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <Grid3X3 size={14} /> 全屏铺满
                </label>
                <button 
                    onClick={() => setIsTiled(!isTiled)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${isTiled ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                    <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${isTiled ? 'translate-x-5' : 'translate-x-0'}`}></span>
                </button>
             </div>

             {isTiled ? (
                 <div className="bg-gray-900/50 p-3 rounded-lg space-y-2">
                    <label className="text-xs text-gray-500">平铺间隙</label>
                    <input type="range" min="10" max="150" value={tileDensity} onChange={(e) => setTileDensity(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                 </div>
             ) : (
                 <div className="flex gap-4">
                    <div className="flex-1 space-y-2">
                        <label className="text-xs text-gray-500 block mb-1">位置预设</label>
                        <PresetGrid />
                    </div>
                    <div className="flex-1 space-y-4 pt-1">
                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-600 uppercase">X 轴</label>
                            <input type="range" min="0" max="100" value={posX} onChange={(e)=>setPosX(parseInt(e.target.value))} className="w-full h-1 bg-gray-700 accent-gray-400"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-600 uppercase">Y 轴</label>
                            <input type="range" min="0" max="100" value={posY} onChange={(e)=>setPosY(parseInt(e.target.value))} className="w-full h-1 bg-gray-700 accent-gray-400"/>
                        </div>
                    </div>
                 </div>
             )}
          </div>
          
           {/* Add More Files Button in Sidebar */}
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

      {/* MAIN AREA */}
      <div className="order-1 md:order-2 flex-1 bg-black/95 relative flex flex-col h-[55vh] md:h-screen">
        
        {/* Top Bar */}
        <div className="h-16 bg-[#121214] border-b border-gray-800 flex items-center justify-between px-6 shadow-sm z-10">
            <div className="flex items-center gap-4">
                 <div className="text-sm font-medium text-gray-300">
                    <span className="text-blue-500 font-bold text-lg mr-1">{selectedIndex + 1}</span>
                    <span className="text-gray-600">/ {imageList.length}</span>
                 </div>
                 <div className="h-4 w-[1px] bg-gray-700"></div>
                 <span className="text-xs text-gray-500 hidden sm:block truncate max-w-[200px]">
                    {imageList[selectedIndex]?.file.name}
                 </span>
            </div>
            
            <div className="flex gap-3">
                <button 
                    onClick={handleDownloadCurrent}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all border border-gray-700"
                >
                    <Download size={16} /> <span className="hidden sm:inline">下载当前</span>
                </button>
                <button 
                    onClick={handleBatchDownload}
                    disabled={isProcessing || !isZipLoaded}
                    className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20 ${
                        isProcessing 
                        ? 'bg-blue-900/50 text-blue-200 cursor-wait' 
                        : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105 active:scale-95'
                    }`}
                >
                    {isProcessing ? (
                        <div className="flex items-center gap-2">
                             <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                             {downloadProgress}%
                        </div>
                    ) : (
                        <><Archive size={16} /> 批量导出全部</>
                    )}
                </button>
            </div>
        </div>

        {/* Canvas Preview Area */}
        <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4 md:p-10 bg-[#0a0a0a]">
             {/* Checkerboard Background for Transparency */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                backgroundImage: 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)',
                backgroundSize: '24px 24px',
                backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px'
            }}></div>

            <div className="relative shadow-2xl z-0 max-w-full max-h-full flex flex-col items-center">
                <canvas
                    ref={canvasRef}
                    className="max-w-full max-h-full object-contain mx-auto rounded shadow-black/50"
                    style={{ maxHeight: 'calc(100vh - 240px)' }}
                />
            </div>
        </div>

        {/* Bottom Thumbnail Strip */}
        <div className="h-24 bg-[#121214] border-t border-gray-800 flex items-center px-4 gap-3 overflow-x-auto custom-scrollbar z-10">
            {imageList.map((img, idx) => (
                <div 
                    key={img.id}
                    onClick={() => setSelectedIndex(idx)}
                    className={`relative flex-shrink-0 h-16 w-16 rounded-lg overflow-hidden cursor-pointer border-2 transition-all group ${
                        idx === selectedIndex ? 'border-blue-500 ring-2 ring-blue-500/20 scale-105 z-10' : 'border-gray-700 hover:border-gray-500 opacity-60 hover:opacity-100'
                    }`}
                >
                    <img src={img.src} className="w-full h-full object-cover" alt="" />
                    <button 
                        onClick={(e) => removeImage(idx, e)}
                        className="absolute top-0 right-0 bg-black/60 text-white rounded-bl-md p-1 opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all backdrop-blur-sm"
                    >
                        <X size={10} />
                    </button>
                </div>
            ))}
            <button 
                onClick={() => fileInputRef.current.click()}
                className="flex-shrink-0 h-16 w-16 rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-gray-500 hover:bg-gray-800 transition-all"
            >
                <Upload size={16} />
                <span className="text-[10px] mt-1 font-medium">加图</span>
            </button>
        </div>

      </div>
    </div>
  );
};

export default WatermarkApp;