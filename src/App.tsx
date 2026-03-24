// @ts-nocheck
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  MapPin, StickyNote, MousePointer2, Hand, Plus, Minus, X, AlignLeft, 
  CheckSquare, Hash, Trash2, Database, Globe, LayoutGrid, 
  List as ListIcon, ImageIcon, Pencil, Layers, Clock, Upload, Smile,
  Map as MapIcon, Satellite, Mountain, Moon, Sun, ChevronDown, Eraser,
  ArrowDownUp, Type, Accessibility, ZoomIn, Navigation, Undo2, Redo2, Trash, Search
} from 'lucide-react';

// --- UTILS & ID GENERATION ---
const generateId = () => Math.random().toString(36).substr(2, 9);

// --- INITIAL DATA ---
const INITIAL_GROUPS = [
  { id: 'g1', name: 'Community Fridges', color: '#ef4444', emoji: '❄️' },
  { id: 'g2', name: 'Underground Venues', color: '#8b5cf6', emoji: '🎸' },
  { id: 'g3', name: 'US National Parks', color: '#22c55e', emoji: '🌲' }
];

const INITIAL_ITEMS = [
  {
    id: '1', type: 'pin', groupId: 'g1',
    x: 400, y: 300, lat: 40.7128, lng: -74.0060,
    title: 'Downtown Fridge', address: '123 Forsyth St, New York, NY 10002',
    color: '#ef4444', scale: 1,
    fields: [
      { id: 'f1', name: 'Inventory', type: 'text', value: 'Apples, Milk, Bread' },
      { id: 'f2', name: 'Needs Cleaning', type: 'boolean', value: true }
    ], src: null, emoji: null
  },
  {
    id: '3', type: 'pin', groupId: 'g3',
    x: 200, y: 400, lat: 44.4280, lng: -110.5885,
    title: 'Yellowstone', address: 'Yellowstone National Park, WY',
    color: '#22c55e', scale: 1,
    fields: [
      { id: 'f5', name: 'Established', type: 'number', value: '1872' }
    ], src: null, emoji: null
  }
];

// ================= LEAFLET MAP ENGINE =================
const LeafletMapEngine = ({ 
  viewMode, items, selectedId, setSelectedId, activeTool, setActiveTool, 
  setItems, getItemColor, getItemGroupEmoji, mapStyle, accessibleRoutes, announce,
  isDrawing, setIsDrawing, currentPath, setCurrentPath, drawings, setDrawings, 
  onFinishDrawing, onEraseDrawing, drawColor, drawWidth
}) => {
  const mapRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [, setTick] = useState(0); 
  const [currentZoom, setCurrentZoom] = useState(4); 
  const tileLayerRef = useRef(null);

  useEffect(() => {
    if (!window.L || mapInstance) return;
    
    const map = window.L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([38, -96], 4);
    setMapInstance(map);
    setCurrentZoom(map.getZoom());

    const handleMove = () => {
      setTick(t => t + 1);
      setCurrentZoom(map.getZoom());
    };
    
    map.on('move', handleMove);
    map.on('zoom', handleMove);
    map.on('resize', handleMove);

    setTimeout(() => map.invalidateSize(), 250);

    return () => {
      map.off('move', handleMove);
      map.off('zoom', handleMove);
      map.off('resize', handleMove);
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapInstance) return;
    if (tileLayerRef.current) mapInstance.removeLayer(tileLayerRef.current);
    
    let url = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'; 
    if (mapStyle === 'dark') url = 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
    if (mapStyle === 'light') url = 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
    if (mapStyle === 'satellite') url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    if (mapStyle === 'terrain') url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'; 

    if (accessibleRoutes) url = 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';

    tileLayerRef.current = window.L.tileLayer(url, { maxZoom: 19 }).addTo(mapInstance);
  }, [mapInstance, mapStyle, accessibleRoutes]);

  useEffect(() => {
    if (mapInstance && viewMode === 'map') setTimeout(() => mapInstance.invalidateSize(), 50);
  }, [mapInstance, viewMode]);

  // Custom Event Listeners for Keyboard-driven Panning
  useEffect(() => {
    if (!mapInstance) return;
    const onReqCenter = () => {
      const center = mapInstance.getCenter();
      window.dispatchEvent(new CustomEvent('receive-map-center', { detail: { lat: center.lat, lng: center.lng } }));
    };
    const onPanMapTo = (e) => {
      mapInstance.panTo([e.detail.lat, e.detail.lng], { animate: true, duration: 0.5 });
    };
    window.addEventListener('request-map-center', onReqCenter);
    window.addEventListener('pan-map-to', onPanMapTo);
    return () => {
      window.removeEventListener('request-map-center', onReqCenter);
      window.removeEventListener('pan-map-to', onPanMapTo);
    };
  }, [mapInstance]);

  const handlePointerDown = (e) => {
    if (activeTool !== 'draw' || !mapInstance) return;
    setIsDrawing(true);
    const pt = mapInstance.mouseEventToContainerPoint(e.nativeEvent);
    const latlng = mapInstance.containerPointToLatLng(pt);
    setCurrentPath([{ lat: latlng.lat, lng: latlng.lng }]);
  };

  const handlePointerMove = (e) => {
    if (!isDrawing || !mapInstance) return;
    const pt = mapInstance.mouseEventToContainerPoint(e.nativeEvent);
    const latlng = mapInstance.containerPointToLatLng(pt);
    setCurrentPath(prev => [...prev, { lat: latlng.lat, lng: latlng.lng }]);
  };

  const handlePointerUp = () => {
    if (isDrawing && currentPath.length > 0) onFinishDrawing(currentPath);
    setCurrentPath([]);
    setIsDrawing(false);
  };

  const renderMapPath = (points) => {
    if (!mapInstance || points.length === 0) return '';
    const validPoints = points.filter(p => p.lat !== undefined && p.lng !== undefined);
    if (validPoints.length === 0) return '';
    return validPoints.map((p, i) => {
      const pt = mapInstance.latLngToContainerPoint([p.lat, p.lng]);
      return `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`;
    }).join(' ');
  };

  const semanticZoomScale = Math.max(0.75, Math.min(1.5, currentZoom / 4));

  return (
    <div className={`absolute inset-0 transition-opacity duration-300 ${viewMode === 'map' ? 'opacity-100 z-0' : 'opacity-0 pointer-events-none'}`} aria-hidden={viewMode !== 'map'}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} tabIndex={viewMode === 'map' ? 0 : -1} aria-label="Interactive Map. Use arrow keys to pan." role="application" />
      
      {activeTool === 'draw' && viewMode === 'map' && mapInstance && (
        <div 
          className="absolute inset-0 z-[500] cursor-crosshair touch-none"
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
          aria-label="Drawing layer. Requires pointing device."
        />
      )}

      {mapInstance && (
        <div className="absolute inset-0 pointer-events-none z-[400] overflow-hidden">
          <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
            {drawings.map(d => (
              <g key={d.id} className={activeTool === 'eraser' ? 'cursor-pointer pointer-events-auto hover:opacity-30 transition-opacity' : ''} onPointerDown={(e) => { if (activeTool === 'eraser') { e.stopPropagation(); onEraseDrawing(d.id); } }}>
                {activeTool === 'eraser' && <path d={renderMapPath(d.path)} stroke="transparent" strokeWidth={Math.max(d.width * semanticZoomScale, 20)} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                <path d={renderMapPath(d.path)} stroke={d.color} strokeWidth={d.width * semanticZoomScale} fill="none" strokeLinecap="round" strokeLinejoin="round" className={activeTool === 'eraser' ? 'pointer-events-none' : ''} />
              </g>
            ))}
            {isDrawing && currentPath.length > 0 && <path d={renderMapPath(currentPath)} stroke={drawColor} strokeWidth={drawWidth * semanticZoomScale} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>

          {items.map(item => {
            if (item.lat === undefined || item.lng === undefined) return null;
            const pt = mapInstance.latLngToContainerPoint([item.lat, item.lng]);
            return (
              <div key={item.id} className="absolute pointer-events-auto" style={{ left: pt.x, top: pt.y }}>
                <CanvasNode 
                  item={item} isSelected={selectedId === item.id} effectiveColor={getItemColor(item)} 
                  groupEmoji={getItemGroupEmoji(item)}
                  zoomScale={semanticZoomScale}
                  onClick={() => { setSelectedId(item.id); announce(`Selected ${item.title}`); }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [mapEngineLoaded, setMapEngineLoaded] = useState(false);
  
  // A11Y GLOBAL STATE
  const [announcement, setAnnouncement] = useState(''); 
  const [toastMsg, setToastMsg] = useState(''); 
  const toastTimeoutRef = useRef(null);

  const [dyslexiaFont, setDyslexiaFont] = useState('none');
  const [textScale, setTextScale] = useState(1);
  const [appTheme, setAppTheme] = useState('light');
  const [accessibleRoutes, setAccessibleRoutes] = useState(false);
  const [showToasts, setShowToasts] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [searchQuery, setSearchQuery] = useState(''); 
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  // VIEW ZOOM SCALES
  const [listZoom, setListZoom] = useState(1);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

  // RESTORED TOOL & DRAWING STATE
  const [drawings, setDrawings] = useState([]);
  const [drawHistory, setDrawHistory] = useState([]); 
  const [drawRedo, setDrawRedo] = useState([]);       

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [drawColor, setDrawColor] = useState('#3b82f6');
  const [drawWidth, setDrawWidth] = useState(4);
  const [selectedEmoji, setSelectedEmoji] = useState('⭐');
  const [selectedStickerMode, setSelectedStickerMode] = useState('emoji'); 
  const [customStickerSrc, setCustomStickerSrc] = useState(null);
  
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const customStickerInputRef = useRef(null);

  // Canvas Mouse Dragging State
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState(null);
  const lastPointer = useRef({ x: 0, y: 0 });

  // A11Y: Dual Announcer (Screen Reader + Visible Toast)
  const announce = useCallback((msg) => {
    setAnnouncement(msg);
    
    if (showToasts) {
      setToastMsg(msg);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setToastMsg('');
      }, 3500);
    }

    setTimeout(() => setAnnouncement(''), 3500);
  }, [showToasts]);

  // Initialization & Font Injection
  useEffect(() => {
    if (!window.L) { 
      let cssReady = false, jsReady = false;
      const checkReady = () => { if (cssReady && jsReady) setMapEngineLoaded(true); };

      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.onload = () => { cssReady = true; checkReady(); };
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => { jsReady = true; checkReady(); };
      document.head.appendChild(script);
    } else {
      setMapEngineLoaded(true);
    }

    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;700;900&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);

    const fontLink2 = document.createElement('link');
    fontLink2.href = 'https://fonts.cdnfonts.com/css/open-dyslexic';
    fontLink2.rel = 'stylesheet';
    document.head.appendChild(fontLink2);

    const style = document.createElement('style');
    style.innerHTML = `
      .font-lexend { font-family: 'Lexend', 'Comic Sans MS', sans-serif !important; letter-spacing: 0.02em; }
      .font-opendyslexic { font-family: 'OpenDyslexic', 'Comic Sans MS', sans-serif !important; letter-spacing: 0.05em; }
    `;
    document.head.appendChild(style);

    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * textScale}px`;
  }, [textScale]);

  useEffect(() => {
    if (appTheme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [appTheme]);

  const [viewMode, setViewMode] = useState('map'); 
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [groups] = useState(INITIAL_GROUPS);
  
  const [selectedId, setSelectedId] = useState(null);
  const [activeTool, setActiveTool] = useState('cursor'); 
  
  const [isMapMenuOpen, setIsMapMenuOpen] = useState(false);
  const [mapStyle, setMapStyle] = useState('street'); 

  // A11Y Search Bar filtering
  const filteredItems = items.filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.address && item.address.toLowerCase().includes(q)) ||
      (item.fields && item.fields.some(f => String(f.value).toLowerCase().includes(q)))
    );
  });

  const getItemColor = (item) => {
    if (item.groupId) {
      const group = groups.find(g => g.id === item.groupId);
      if (group) return group.color;
    }
    return item.color;
  };

  const getItemGroupEmoji = (item) => {
    if (item.groupId) {
      const group = groups.find(g => g.id === item.groupId);
      if (group) return group.emoji;
    }
    return null;
  };

  const updateItem = (id, updates) => setItems(items.map(i => i.id === id ? { ...i, ...updates } : i));
  const deleteItem = (id) => { setItems(items.filter(i => i.id !== id)); setSelectedId(null); announce("Item deleted"); };

  const handleToolChange = (tool, name) => {
    setActiveTool(tool);
    if (tool === 'draw') announce(`Pencil tool activated. Note: Drawing requires a pointing device.`);
    else if (tool === 'clear') announce(`Clear Data options opened.`);
    else announce(`${name} tool activated`);
  };

  const handleViewChange = (view, name) => {
    setViewMode(view);
    setIsMapMenuOpen(false);
    announce(`Switched to ${name} view`);
  };

  const handleThemeToggle = () => {
    const nextTheme = appTheme === 'light' ? 'dark' : 'light';
    setAppTheme(nextTheme);
    setMapStyle(nextTheme);
    setAccessibleRoutes(false);
    announce(`${nextTheme} UI theme and map style enabled`);
  };

  const handleFinishDrawing = useCallback((newPath) => {
    const newDrawing = { id: generateId(), path: newPath, color: drawColor, width: drawWidth };
    setDrawHistory(prev => [...prev, drawings]);
    setDrawRedo([]);
    setDrawings(prev => [...prev, newDrawing]);
  }, [drawColor, drawWidth, drawings]);

  const handleEraseDrawing = useCallback((idToErase) => {
    setDrawHistory(prev => [...prev, drawings]);
    setDrawRedo([]);
    setDrawings(prev => prev.filter(x => x.id !== idToErase));
    announce("Drawing erased. Press Control Z to undo.");
  }, [drawings, announce]);

  const handleClearAllDrawings = () => {
    setDrawHistory(prev => [...prev, drawings]);
    setDrawRedo([]);
    setDrawings([]);
    announce("All drawings cleared. Press Control Z to undo.");
  };

  const handleUndo = useCallback(() => {
    if (drawHistory.length > 0) {
      const prevState = drawHistory[drawHistory.length - 1];
      setDrawRedo(prev => [...prev, drawings]);
      setDrawings(prevState);
      setDrawHistory(prev => prev.slice(0, -1));
      announce("Undid drawing action");
    } else {
      announce("Nothing to undo");
    }
  }, [drawHistory, drawings, announce]);

  const handleRedo = useCallback(() => {
    if (drawRedo.length > 0) {
      const nextState = drawRedo[drawRedo.length - 1];
      setDrawHistory(prev => [...prev, drawings]);
      setDrawings(nextState);
      setDrawRedo(prev => prev.slice(0, -1));
      announce("Redid drawing action");
    } else {
      announce("Nothing to redo");
    }
  }, [drawRedo, drawings, announce]);

  const handleDropToCenter = useCallback((forcedLat, forcedLng) => {
    if (!['pin', 'note', 'image', 'sticker'].includes(activeTool)) return;
    
    let lat = forcedLat || 40;
    let lng = forcedLng || -74;
    
    const rect = document.body.getBoundingClientRect();
    const x = (rect.width / 2 - transform.x) / transform.scale;
    const y = (rect.height / 2 - transform.y) / transform.scale;

    const newItem = {
      id: generateId(), type: activeTool, lat, lng, x, y,
      title: activeTool === 'pin' ? 'New Location' : activeTool === 'image' ? 'New Image' : activeTool === 'sticker' ? (selectedStickerMode === 'emoji' ? selectedEmoji : 'Custom Sticker') : 'New Note',
      address: activeTool === 'pin' ? '' : undefined,
      color: activeTool === 'note' ? '#fef08a' : '#3b82f6',
      scale: 1, 
      groupId: null, fields: [], 
      src: activeTool === 'sticker' && selectedStickerMode === 'custom' ? customStickerSrc : null,
      emoji: activeTool === 'sticker' && selectedStickerMode === 'emoji' ? selectedEmoji : null
    };
    
    setItems(prev => [...prev, newItem]);
    setSelectedId(newItem.id);
    setActiveTool('cursor');
    announce(`Dropped new ${activeTool} at center of screen. Moved to select tool.`);
  }, [activeTool, transform, selectedEmoji, selectedStickerMode, customStickerSrc, announce]);

  useEffect(() => {
    const onReceiveMapCenter = (e) => handleDropToCenter(e.detail.lat, e.detail.lng);
    window.addEventListener('receive-map-center', onReceiveMapCenter);
    return () => window.removeEventListener('receive-map-center', onReceiveMapCenter);
  }, [handleDropToCenter]);

  // Global Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      
      const key = e.key.toLowerCase();
      
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if (key === '[' || key === ']') {
        e.preventDefault();
        if (filteredItems.length === 0) return;
        let newIdx = 0;
        if (selectedId) {
          const currentIdx = filteredItems.findIndex(i => i.id === selectedId);
          if (key === '[') newIdx = currentIdx <= 0 ? filteredItems.length - 1 : currentIdx - 1;
          if (key === ']') newIdx = currentIdx === -1 || currentIdx >= filteredItems.length - 1 ? 0 : currentIdx + 1;
        }
        const nextItem = filteredItems[newIdx];
        setSelectedId(nextItem.id);
        announce(`Jumped to ${nextItem.title}`);

        if (viewMode === 'map' && nextItem.lat !== undefined) {
          window.dispatchEvent(new CustomEvent('pan-map-to', { detail: { lat: nextItem.lat, lng: nextItem.lng } }));
        } else if (viewMode === 'canvas' && nextItem.x !== undefined) {
          setTransform(p => ({
            ...p,
            x: window.innerWidth / 2 - nextItem.x * p.scale,
            y: window.innerHeight / 2 - nextItem.y * p.scale
          }));
        }
        return;
      }

      if (key === '=' || key === '+') {
        if (viewMode === 'canvas') { setTransform(p => ({ ...p, scale: Math.min(5, p.scale + 0.2) })); announce("Canvas zoomed in"); }
        if (viewMode === 'list') { setListZoom(p => Math.min(3, p + 0.2)); announce("List zoomed in"); }
        return;
      }
      if (key === '-') {
        if (viewMode === 'canvas') { setTransform(p => ({ ...p, scale: Math.max(0.2, p.scale - 0.2) })); announce("Canvas zoomed out"); }
        if (viewMode === 'list') { setListZoom(p => Math.max(0.5, p - 0.2)); announce("List zoomed out"); }
        return;
      }

      if (key === 'm') { 
        if (viewMode !== 'map') { setViewMode('map'); setIsMapMenuOpen(false); announce('Switched to Map view'); } 
        else { setIsMapMenuOpen(prev => { const willOpen = !prev; announce(willOpen ? 'Map style menu opened' : 'Map style menu closed'); return willOpen; }); }
        return; 
      }
      if (key === 'a') {
        setIsSettingsMenuOpen(prev => { const willOpen = !prev; announce(willOpen ? 'Settings menu opened' : 'Settings menu closed'); return willOpen; });
        return;
      }
      if (key === 'c') { setViewMode('canvas'); setIsMapMenuOpen(false); announce('Switched to Canvas view'); return; }
      if (key === 'l') { setViewMode('list'); setIsMapMenuOpen(false); announce('Switched to List view'); return; }
      if (key === 'v') { handleToolChange('cursor', 'Select'); return; }
      if (key === 'h') { handleToolChange('hand', 'Pan'); return; }
      if (key === 'p') { handleToolChange('pin', 'Pin'); return; }
      if (key === 'n') { handleToolChange('note', 'Note'); return; }
      if (key === 'd') { handleToolChange('draw', 'Draw'); return; }
      if (key === 'e') { handleToolChange('eraser', 'Eraser'); return; }
      if (key === 'i') { handleToolChange('image', 'Image'); return; }
      if (key === 's') { handleToolChange('sticker', 'Sticker'); return; }

      if (e.key === 'Escape') {
        setIsMapMenuOpen(false);
        setIsSettingsMenuOpen(false);
        setIsSearchExpanded(false);
        setSelectedId(null);
        setActiveTool('cursor');
        setIsDrawing(false);
        setCurrentPath([]);
        announce("Action cancelled. Menus closed and returned to Select tool.");
        e.preventDefault();
        return;
      }

      if (!selectedId && viewMode === 'canvas') {
        const panStep = e.shiftKey ? 100 : 40;
        if (e.key === 'ArrowUp') { setTransform(p => ({ ...p, y: p.y + panStep })); announce("Panned Up"); e.preventDefault(); return; }
        if (e.key === 'ArrowDown') { setTransform(p => ({ ...p, y: p.y - panStep })); announce("Panned Down"); e.preventDefault(); return; }
        if (e.key === 'ArrowLeft') { setTransform(p => ({ ...p, x: p.x + panStep })); announce("Panned Left"); e.preventDefault(); return; }
        if (e.key === 'ArrowRight') { setTransform(p => ({ ...p, x: p.x - panStep })); announce("Panned Right"); e.preventDefault(); return; }
      }
      
      if (e.key === 'Enter' && ['pin', 'note', 'image', 'sticker'].includes(activeTool)) {
        e.preventDefault();
        if (viewMode === 'map') window.dispatchEvent(new CustomEvent('request-map-center'));
        else handleDropToCenter();
        return;
      }

      if (selectedId) {
        const step = e.shiftKey ? 40 : 10; 
        const latLngStep = e.shiftKey ? 1 : 0.1;
        let dx = 0, dy = 0, dLat = 0, dLng = 0;
        
        if (e.key === 'ArrowUp') { dy = -step; dLat = latLngStep; }
        else if (e.key === 'ArrowDown') { dy = step; dLat = -latLngStep; }
        else if (e.key === 'ArrowLeft') { dx = -step; dLng = -latLngStep; }
        else if (e.key === 'ArrowRight') { dx = step; dLng = latLngStep; }
        else if (e.key === 'Delete' || e.key === 'Backspace') { deleteItem(selectedId); return; }

        if (dx !== 0 || dy !== 0) {
          e.preventDefault(); 
          setItems(prev => prev.map(item => item.id === selectedId ? { 
            ...item, 
            x: item.x + dx, y: item.y + dy,
            lat: item.lat !== undefined ? item.lat + dLat : item.lat,
            lng: item.lng !== undefined ? item.lng + dLng : item.lng 
          } : item));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, items, activeTool, viewMode, filteredItems, handleDropToCenter, handleUndo, handleRedo, announce]);

  const handleCanvasPointerDown = (e) => {
    if (viewMode !== 'canvas') return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;

    if (activeTool === 'draw') {
      setIsDrawing(true);
      setCurrentPath([{ x, y }]);
      return;
    }

    if (activeTool === 'hand') {
      setIsDraggingCanvas(true);
      lastPointer.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (['pin', 'note', 'image', 'sticker'].includes(activeTool)) {
      const newItem = {
        id: generateId(), type: activeTool, lat: undefined, lng: undefined, x, y,
        title: activeTool === 'pin' ? 'New Location' : activeTool === 'image' ? 'New Image' : activeTool === 'sticker' ? (selectedStickerMode === 'emoji' ? selectedEmoji : 'Custom Sticker') : 'New Note',
        address: activeTool === 'pin' ? '' : undefined,
        color: activeTool === 'note' ? '#fef08a' : '#3b82f6',
        scale: 1, 
        groupId: null, fields: [], 
        src: activeTool === 'sticker' && selectedStickerMode === 'custom' ? customStickerSrc : null,
        emoji: activeTool === 'sticker' && selectedStickerMode === 'emoji' ? selectedEmoji : null
      };
      
      setItems(prev => [...prev, newItem]);
      setSelectedId(newItem.id);
      setActiveTool('cursor');
      announce(`Dropped new ${activeTool} on canvas. Moved to select tool.`);
      return;
    }

    if (activeTool === 'cursor') {
      setSelectedId(null);
    }
  };

  const handleCanvasPointerMove = (e) => {
    if (viewMode !== 'canvas') return;

    if (draggedItemId && activeTool === 'cursor') {
      const dx = (e.clientX - lastPointer.current.x) / transform.scale;
      const dy = (e.clientY - lastPointer.current.y) / transform.scale;
      setItems(prev => prev.map(i => i.id === draggedItemId ? { ...i, x: i.x + dx, y: i.y + dy } : i));
      lastPointer.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (isDraggingCanvas && activeTool === 'hand') {
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastPointer.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (isDrawing && activeTool === 'draw') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;
      setCurrentPath(prev => [...prev, { x, y }]);
    }
  };

  const handleCanvasPointerUp = () => {
    if (viewMode !== 'canvas') return;
    
    if (isDrawing && currentPath.length > 0) {
      handleFinishDrawing(currentPath);
      setCurrentPath([]);
      setIsDrawing(false);
    }
    if (draggedItemId) {
      setDraggedItemId(null);
    }
    if (isDraggingCanvas) {
      setIsDraggingCanvas(false);
    }
  };

  const handleCanvasWheel = (e) => {
    if (viewMode !== 'canvas') return;
    if (e.ctrlKey || e.metaKey) {
      setTransform(p => ({ ...p, scale: Math.max(0.2, Math.min(5, p.scale - e.deltaY * 0.005)) }));
    } else {
      setTransform(p => ({ ...p, x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const renderCanvasPath = (points) => {
    const valid = points.filter(p => p.x !== undefined && p.y !== undefined);
    return valid.length === 0 ? '' : valid.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !selectedId) return;
    const reader = new FileReader();
    reader.onload = (ev) => updateItem(selectedId, { src: ev.target.result });
    reader.readAsDataURL(file);
  };

  const handleCustomStickerUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setCustomStickerSrc(ev.target.result); setSelectedStickerMode('custom'); };
    reader.readAsDataURL(file);
  };

  const selectedItem = items.find(i => i.id === selectedId);

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (!sortConfig.key) return 0;
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    if (aVal === undefined) return 1;
    if (bVal === undefined) return -1;
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
    announce(`Sorted by ${key} ${direction === 'asc' ? 'ascending' : 'descending'}`);
  };

  const fontClass = dyslexiaFont === 'lexend' ? 'font-lexend' : dyslexiaFont === 'opendyslexic' ? 'font-opendyslexic' : 'font-sans';

  let canvasCursorClass = '';
  if (activeTool === 'draw') canvasCursorClass = 'cursor-crosshair touch-none';
  else if (activeTool === 'hand') canvasCursorClass = isDraggingCanvas ? 'cursor-grabbing touch-none' : 'cursor-grab touch-none';
  else if (['pin', 'note', 'image', 'sticker'].includes(activeTool)) canvasCursorClass = 'cursor-crosshair';

  return (
    <div className={`relative w-full h-screen overflow-hidden flex transition-all ${fontClass} bg-neutral-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100`}>
      
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-[9999] bg-indigo-800 text-white px-6 py-4 rounded-xl font-bold border-4 border-indigo-900 shadow-2xl">
        Skip to main content
      </a>

      <div aria-live="polite" className="sr-only" role="status">
        Currently active tool: {activeTool}. Use arrow keys to pan map or canvas. Press [ and ] to jump between items.
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only" role="status">
        {announcement}
      </div>

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[9999] bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3 rounded-xl shadow-2xl font-bold text-lg pointer-events-none transition-all animate-bounce">
          {toastMsg}
        </div>
      )}

      {(viewMode === 'map' || viewMode === 'canvas') && (
        <div className="absolute bottom-8 left-8 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border-2 border-slate-300 dark:border-slate-700 p-5 z-[710] w-64 pointer-events-auto" role="region" aria-label="Map Legend">
          <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-200 mb-4 tracking-wider uppercase border-b-2 border-slate-200 dark:border-slate-700 pb-2">Map Legend</h2>
          <ul className="space-y-4">
            {groups.map(g => (
              <li key={g.id} className="flex items-center text-slate-900 dark:text-slate-100 font-bold text-base">
                <div className="relative w-8 h-8 flex items-center justify-center mr-4">
                  <MapPin className="w-8 h-8 absolute drop-shadow-md text-slate-900 dark:text-slate-100" strokeWidth={2.5} style={{ fill: g.color }} />
                  <div className="absolute top-[2px] left-1/2 -translate-x-1/2 w-4 h-4 bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-100 rounded-full flex items-center justify-center text-[8px] shadow-sm">
                    {g.emoji}
                  </div>
                </div>
                {g.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      <main id="main-content" className="absolute inset-0 w-full h-full">
        {mapEngineLoaded && (
          <LeafletMapEngine
            viewMode={viewMode} items={filteredItems} selectedId={selectedId} setSelectedId={setSelectedId}
            activeTool={activeTool} setActiveTool={setActiveTool} setItems={setItems} 
            getItemColor={getItemColor} getItemGroupEmoji={getItemGroupEmoji}
            mapStyle={mapStyle} accessibleRoutes={accessibleRoutes} announce={announce}
            isDrawing={isDrawing} setIsDrawing={setIsDrawing} currentPath={currentPath} setCurrentPath={setCurrentPath}
            drawings={drawings} setDrawings={setDrawings} drawColor={drawColor} drawWidth={drawWidth}
            onFinishDrawing={handleFinishDrawing} onEraseDrawing={handleEraseDrawing}
          />
        )}

        {viewMode === 'canvas' && (
          <div 
            ref={canvasRef}
            className={`absolute inset-0 overflow-hidden bg-slate-50 dark:bg-slate-800 ${canvasCursorClass}`}
            style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '20px 20px', color: appTheme === 'dark' ? '#334155' : '#cbd5e1' }}
            role="region" aria-label="Infinite Canvas"
            onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={handleCanvasPointerUp} onPointerLeave={handleCanvasPointerUp}
            onWheel={handleCanvasWheel}
          >
            <div className="absolute origin-top-left" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
              
              <svg className="absolute inset-0 overflow-visible pointer-events-none z-0">
                {drawings.map(d => (
                  <g key={d.id} className={activeTool === 'eraser' ? 'cursor-pointer pointer-events-auto hover:opacity-30 transition-opacity' : ''} onPointerDown={(e) => { if (activeTool === 'eraser') { e.stopPropagation(); handleEraseDrawing(d.id); } }}>
                    {activeTool === 'eraser' && <path d={renderCanvasPath(d.path)} stroke="transparent" strokeWidth={Math.max(d.width / transform.scale, 20 / transform.scale)} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                    <path d={renderCanvasPath(d.path)} stroke={d.color} strokeWidth={d.width / transform.scale} fill="none" strokeLinecap="round" strokeLinejoin="round" className={activeTool === 'eraser' ? 'pointer-events-none' : ''} />
                  </g>
                ))}
                {isDrawing && currentPath.length > 0 && <path d={renderCanvasPath(currentPath)} stroke={drawColor} strokeWidth={drawWidth / transform.scale} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
              </svg>

              {filteredItems.map((item) => (
                <CanvasNode 
                  key={item.id} item={item} isSelected={selectedId === item.id} 
                  effectiveColor={getItemColor(item)} groupEmoji={getItemGroupEmoji(item)} positionStyle={{ left: item.x, top: item.y }} 
                  onClick={() => { setSelectedId(item.id); announce(`Selected ${item.title}`); }}
                  onPointerDown={(e) => {
                    if (activeTool === 'cursor') {
                      e.stopPropagation();
                      setDraggedItemId(item.id);
                      setSelectedId(item.id);
                      lastPointer.current = { x: e.clientX, y: e.clientY };
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {viewMode === 'list' && (
          <div className="absolute inset-0 pt-32 px-8 pb-8 overflow-auto bg-white dark:bg-slate-900 z-0" role="region" aria-label="Database List View">
            <div className="max-w-6xl mx-auto origin-top transition-transform" style={{ transform: `scale(${listZoom})` }}>
              <h2 className="text-3xl font-bold mb-6 flex items-center text-slate-900 dark:text-white" tabIndex={0}><Database className="mr-3" aria-hidden="true"/> Database View</h2>
              <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl shadow-sm overflow-x-auto" role="region" aria-label="Items Data Table">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-200 dark:bg-slate-900 border-b-2 border-slate-300 dark:border-slate-700">
                      <th scope="col" className="p-4 text-base font-bold text-slate-800 dark:text-slate-200">Title</th>
                      <th scope="col" className="p-4 text-base font-bold text-slate-800 dark:text-slate-200">Type</th>
                      <th scope="col" className="p-4 text-base font-bold text-slate-800 dark:text-slate-200">Address</th>
                      <th scope="col" className="p-4">
                        <button onClick={() => handleSort('lat')} className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center hover:text-indigo-800 dark:hover:text-indigo-300 focus-visible:ring-4 focus-visible:ring-indigo-700 rounded">
                          Latitude (N/S) <ArrowDownUp className="w-5 h-5 ml-2" aria-hidden="true"/>
                        </button>
                      </th>
                      <th scope="col" className="p-4">
                        <button onClick={() => handleSort('lng')} className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center hover:text-indigo-800 dark:hover:text-indigo-300 focus-visible:ring-4 focus-visible:ring-indigo-700 rounded">
                          Longitude (E/W) <ArrowDownUp className="w-5 h-5 ml-2" aria-hidden="true"/>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map(item => (
                      <tr key={item.id} className="border-b border-slate-300 dark:border-slate-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 focus-within:bg-indigo-100 dark:focus-within:bg-indigo-900/40 cursor-pointer transition-colors" tabIndex={0} 
                          onClick={() => { setViewMode('map'); setSelectedId(item.id); announce(`Located ${item.title} on map.`); }}
                          onKeyDown={(e) => { if(e.key==='Enter') { setViewMode('map'); setSelectedId(item.id); } }}>
                        <td className="p-4 text-base font-bold text-slate-900 dark:text-white">{item.title}</td>
                        <td className="p-4 text-base text-slate-800 dark:text-slate-200 capitalize">{item.type}</td>
                        <td className="p-4 text-base text-slate-800 dark:text-slate-200">{item.address || 'N/A'}</td>
                        <td className="p-4 text-base text-slate-800 dark:text-slate-200 font-mono">{item.lat ? item.lat.toFixed(4) : 'N/A'}</td>
                        <td className="p-4 text-base text-slate-800 dark:text-slate-200 font-mono">{item.lng ? item.lng.toFixed(4) : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* HEADER / NAVIGATION */}
      <header className="absolute top-6 left-1/2 transform -translate-x-1/2 w-[95%] max-w-6xl bg-white dark:bg-slate-800 rounded-2xl shadow-md flex items-center justify-between border-2 border-slate-300 dark:border-slate-700 z-[700] p-2" aria-label="Main Navigation">
        <div className="flex items-center">
          <h1 className="flex items-center px-4 mr-2 m-0">
            <div className="bg-indigo-800 p-2 rounded-lg mr-3"><Database className="w-6 h-6 text-white" aria-hidden="true"/></div>
            <span className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight hidden sm:block">Pinned</span>
          </h1>
        </div>

        <nav className="flex space-x-2 px-2" aria-label="View Modes">
          
          {!isSearchExpanded ? (
            <button 
              onClick={() => setIsSearchExpanded(true)}
              aria-label="Open Search"
              className={`p-2 px-4 rounded-xl flex items-center space-x-2 transition-all text-base font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 border-2 bg-transparent text-slate-800 hover:bg-slate-200 border-transparent hover:border-slate-400 dark:text-slate-200 dark:hover:bg-slate-700`}
            >
              <Search className="w-5 h-5" aria-hidden="true" />
              <span className="hidden sm:inline">Search</span>
            </button>
          ) : (
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-xl px-4 py-2 border-2 border-indigo-400 dark:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-700 transition-all w-48 sm:w-64 mr-2">
              <Search className="w-5 h-5 text-slate-800 dark:text-slate-200 mr-2" aria-hidden="true" />
              <input 
                autoFocus
                type="text" placeholder="Search..." aria-label="Search pins and notes"
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none w-full text-base font-bold text-slate-900 dark:text-white placeholder-slate-700 dark:placeholder-slate-300"
              />
              <button onClick={() => { setIsSearchExpanded(false); setSearchQuery(''); }} aria-label="Close Search" className="p-1 ml-1 rounded focus-visible:ring-4 focus-visible:ring-indigo-700 hover:bg-slate-300 dark:hover:bg-slate-700">
                <X className="w-5 h-5 text-slate-800 dark:text-slate-200" />
              </button>
            </div>
          )}

          <div className="relative hidden lg:block">
            <button 
              onClick={() => { 
                if (viewMode !== 'map') { handleViewChange('map', 'Map'); } 
                else { setIsMapMenuOpen(!isMapMenuOpen); setIsSettingsMenuOpen(false); announce(isMapMenuOpen ? 'Map style menu closed' : 'Map style menu opened'); }
              }} 
              aria-expanded={isMapMenuOpen} aria-haspopup="true" aria-keyshortcuts="M"
              className={`p-2 px-4 rounded-xl flex items-center space-x-2 transition-all text-base font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 border-2 ${viewMode === 'map' ? 'bg-indigo-200 text-indigo-900 border-indigo-400 dark:bg-indigo-900/50 dark:text-indigo-100 dark:border-indigo-600' : 'bg-transparent text-slate-800 hover:bg-slate-200 border-transparent hover:border-slate-400 dark:text-slate-200 dark:hover:bg-slate-700'}`}
            >
              <Globe className="w-5 h-5" aria-hidden="true" />
              <span>Map View</span>
              {viewMode === 'map' && <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${isMapMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />}
              <span className="ml-2 text-base font-bold bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2 py-1 rounded" aria-hidden="true">M</span>
            </button>

            {viewMode === 'map' && isMapMenuOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border-2 border-slate-300 dark:border-slate-600 py-2 w-64 z-[800] flex flex-col" role="menu" aria-label="Map Style Options">
                <div className="px-4 pb-2 mb-1 text-base font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b-2 border-slate-200 dark:border-slate-700" aria-hidden="true">Map Style</div>
                
                <MapStyleMenuItem icon={Navigation} label="Accessible Routes" active={accessibleRoutes} onClick={() => { setAccessibleRoutes(true); setIsMapMenuOpen(false); announce("Changed map style to Accessible Routes"); }} />
                <MapStyleMenuItem icon={MapIcon} label="Street" active={mapStyle === 'street' && !accessibleRoutes} onClick={() => { setMapStyle('street'); setAccessibleRoutes(false); setIsMapMenuOpen(false); announce("Changed map style to Street"); }} />
                <MapStyleMenuItem icon={Moon} label="Dark" active={mapStyle === 'dark' && !accessibleRoutes} onClick={() => { setMapStyle('dark'); setAccessibleRoutes(false); setIsMapMenuOpen(false); announce("Changed map style to Dark"); }} />
                <MapStyleMenuItem icon={Sun} label="Light" active={mapStyle === 'light' && !accessibleRoutes} onClick={() => { setMapStyle('light'); setAccessibleRoutes(false); setIsMapMenuOpen(false); announce("Changed map style to Light"); }} />
                <MapStyleMenuItem icon={Satellite} label="Satellite" active={mapStyle === 'satellite' && !accessibleRoutes} onClick={() => { setMapStyle('satellite'); setAccessibleRoutes(false); setIsMapMenuOpen(false); announce("Changed map style to Satellite"); }} />
                <MapStyleMenuItem icon={Mountain} label="Terrain" active={mapStyle === 'terrain' && !accessibleRoutes} onClick={() => { setMapStyle('terrain'); setAccessibleRoutes(false); setIsMapMenuOpen(false); announce("Changed map style to Terrain"); }} />
              </div>
            )}
          </div>

          <ViewButton icon={LayoutGrid} label="Canvas" shortcut="C" active={viewMode === 'canvas'} onClick={() => handleViewChange('canvas', 'Canvas')} />
          <ViewButton icon={ListIcon} label="List" shortcut="L" active={viewMode === 'list'} onClick={() => handleViewChange('list', 'List')} />
          
          <div className="w-0.5 h-8 bg-slate-300 dark:bg-slate-700 mx-2 hidden sm:block" aria-hidden="true"></div>

          <div className="relative">
            <button 
              onClick={() => { 
                setIsSettingsMenuOpen(!isSettingsMenuOpen); setIsMapMenuOpen(false);
                announce(isSettingsMenuOpen ? 'Settings menu closed' : 'Settings menu opened');
              }} 
              aria-expanded={isSettingsMenuOpen} aria-haspopup="true" aria-keyshortcuts="A"
              className={`p-2 px-4 rounded-xl flex items-center space-x-2 transition-all text-base font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 border-2 ${isSettingsMenuOpen ? 'bg-indigo-200 text-indigo-900 border-indigo-400 dark:bg-indigo-900/50 dark:text-indigo-100 dark:border-indigo-600' : 'bg-transparent text-slate-800 hover:bg-slate-200 border-transparent hover:border-slate-400 dark:text-slate-200 dark:hover:bg-slate-700'}`}
            >
              <Accessibility className="w-5 h-5" aria-hidden="true" />
              <span className="hidden sm:inline">Settings</span>
              <span className="hidden lg:inline ml-2 text-base font-bold bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2 py-1 rounded" aria-hidden="true">A</span>
            </button>

            {isSettingsMenuOpen && (
              <div className="absolute top-full right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border-2 border-slate-300 dark:border-slate-600 py-3 w-[360px] z-[800] flex flex-col max-h-[80vh] overflow-y-auto" role="menu" aria-label="Accessibility and Data Settings">
                
                <div className="px-5 pb-2 mb-2 text-base font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b-2 border-slate-200 dark:border-slate-700" aria-hidden="true">Vision & Text</div>
                
                <div className="px-5 py-3 flex flex-col space-y-3 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors rounded-lg mx-2">
                  <span className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center"><Type className="w-5 h-5 mr-3 text-indigo-800 dark:text-indigo-300"/> Readable Font</span>
                  <div className="flex flex-col space-y-2">
                    <button onClick={() => { setDyslexiaFont('none'); announce("Standard font enabled"); }} className={`py-3 px-4 rounded-lg border-2 font-bold text-base focus-visible:ring-4 focus-visible:ring-indigo-700 ${dyslexiaFont === 'none' ? 'border-indigo-600 bg-indigo-100 text-indigo-900 dark:bg-indigo-900/80 dark:text-indigo-100' : 'border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'}`}>Standard Sans</button>
                    <button onClick={() => { setDyslexiaFont('lexend'); announce("Lexend font enabled"); }} className={`py-3 px-4 rounded-lg border-2 font-bold text-base font-lexend focus-visible:ring-4 focus-visible:ring-indigo-700 ${dyslexiaFont === 'lexend' ? 'border-indigo-600 bg-indigo-100 text-indigo-900 dark:bg-indigo-900/80 dark:text-indigo-100' : 'border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'}`}>Lexend</button>
                    <button onClick={() => { setDyslexiaFont('opendyslexic'); announce("OpenDyslexic font enabled"); }} className={`py-3 px-4 rounded-lg border-2 font-bold text-base font-opendyslexic focus-visible:ring-4 focus-visible:ring-indigo-700 ${dyslexiaFont === 'opendyslexic' ? 'border-indigo-600 bg-indigo-100 text-indigo-900 dark:bg-indigo-900/80 dark:text-indigo-100' : 'border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'}`}>OpenDyslexic</button>
                  </div>
                </div>

                <div className="px-5 py-3 flex flex-col space-y-3 mt-1 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors rounded-lg mx-2">
                  <span className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center"><ZoomIn className="w-5 h-5 mr-3 text-indigo-800 dark:text-indigo-300"/> UI Text Scale ({Math.round(textScale * 100)}%)</span>
                  <div className="flex items-center space-x-2">
                    <button onClick={() => { const ns = Math.max(0.75, textScale - 0.25); setTextScale(ns); announce(`Text size decreased to ${Math.round(ns * 100)} percent`); }} className="flex-1 py-3 bg-slate-200 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 rounded-lg font-black text-xl hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 focus-visible:ring-4 focus-visible:ring-indigo-700" aria-label="Decrease text size">-</button>
                    <button onClick={() => { setTextScale(1); announce("Text size reset to 100 percent"); }} className="flex-1 py-3 bg-slate-200 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 rounded-lg font-bold text-base hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 focus-visible:ring-4 focus-visible:ring-indigo-700" aria-label="Reset text size to default">Reset</button>
                    <button onClick={() => { const ns = Math.min(2, textScale + 0.25); setTextScale(ns); announce(`Text size increased to ${Math.round(ns * 100)} percent`); }} className="flex-1 py-3 bg-slate-200 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 rounded-lg font-black text-xl hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 focus-visible:ring-4 focus-visible:ring-indigo-700" aria-label="Increase text size">+</button>
                  </div>
                </div>

                <label 
                  className="px-5 py-3 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors rounded-lg mx-2 cursor-pointer focus-within:ring-4 focus-within:ring-indigo-700"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setShowToasts(!showToasts);
                      announce(`Visual notifications ${!showToasts ? 'enabled' : 'disabled'}`);
                    }
                  }}
                >
                  <span className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center"><AlignLeft className="w-5 h-5 mr-3 text-indigo-800 dark:text-indigo-300"/> Visual Notifications</span>
                  <input 
                    type="checkbox" 
                    checked={showToasts} 
                    onChange={(e) => { 
                      setShowToasts(e.target.checked); 
                      announce(`Visual notifications ${e.target.checked ? 'enabled' : 'disabled'}`); 
                    }} 
                    className="w-6 h-6 rounded accent-indigo-700 cursor-pointer focus-visible:outline-none bg-white dark:bg-slate-800 border-2 border-slate-400" 
                    aria-label="Toggle Visual Notifications"
                  />
                </label>

              </div>
            )}
          </div>

          <button 
            onClick={handleThemeToggle}
            aria-label={appTheme === 'light' ? 'Switch to Dark UI Theme' : 'Switch to Light UI Theme'}
            className="p-2 px-4 rounded-xl flex items-center space-x-2 transition-all text-base font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 border-2 bg-transparent text-slate-800 hover:bg-slate-200 border-transparent hover:border-slate-400 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {appTheme === 'light' ? <Moon className="w-5 h-5" aria-hidden="true" /> : <Sun className="w-5 h-5" aria-hidden="true" />}
          </button>
        </nav>
      </header>

      {/* A11Y ZOOM CONTROLS FOR NON-MAP VIEWS */}
      {viewMode !== 'map' && (
        <div className="absolute bottom-8 right-8 flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-2xl border-2 border-slate-300 dark:border-slate-700 z-[710]" role="group" aria-label="View Zoom Controls">
          <button 
            onClick={() => {
              if (viewMode === 'canvas') { setTransform(p => ({ ...p, scale: Math.min(5, p.scale + 0.2) })); announce("Canvas zoomed in"); }
              if (viewMode === 'list') { setListZoom(p => Math.min(3, p + 0.2)); announce("List zoomed in"); }
            }}
            className="p-3 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-t-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 text-slate-800 dark:text-slate-200 transition-colors"
            aria-label="Zoom In (Shortcut: +)"
            title="Zoom In"
          >
            <Plus className="w-6 h-6" aria-hidden="true" />
          </button>
          <div className="h-0.5 w-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
          <button 
            onClick={() => {
              if (viewMode === 'canvas') { setTransform(p => ({ ...p, scale: Math.max(0.2, p.scale - 0.2) })); announce("Canvas zoomed out"); }
              if (viewMode === 'list') { setListZoom(p => Math.max(0.5, p - 0.2)); announce("List zoomed out"); }
            }}
            className="p-3 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-b-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 text-slate-800 dark:text-slate-200 transition-colors"
            aria-label="Zoom Out (Shortcut: -)"
            title="Zoom Out"
          >
            <Minus className="w-6 h-6" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* A11Y KEYBOARD DROP INSTRUCTION */}
      {['pin', 'note', 'image', 'sticker'].includes(activeTool) && viewMode !== 'list' && (
        <div className="absolute top-32 left-1/2 transform -translate-x-1/2 bg-indigo-800 dark:bg-indigo-700 text-white px-6 py-4 rounded-xl shadow-lg font-bold text-base z-[710] flex flex-col items-center border-2 border-indigo-900">
          <span className="mb-3 text-lg text-center">Pan to location, then press Enter. Use [ and ] to jump items.</span>
          <button 
            onClick={() => { if (viewMode === 'map') window.dispatchEvent(new CustomEvent('request-map-center')); else handleDropToCenter(); }}
            className="bg-white text-indigo-900 px-5 py-3 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white border-2 border-transparent hover:bg-indigo-100"
            aria-label={`Drop ${activeTool} at center of screen`}
          >
            Drop {activeTool} at Center
          </button>
        </div>
      )}

      {/* CLEAR CANVAS SUB-TOOLBAR */}
      {activeTool === 'clear' && viewMode !== 'list' && (
        <div className="absolute bottom-28 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-800 px-5 py-3 rounded-2xl shadow-xl border-2 border-slate-300 dark:border-slate-700 flex items-center space-x-4 z-[710]">
          <button 
            onClick={() => { setItems([]); setSelectedId(null); setActiveTool('cursor'); announce("All pins and notes permanently deleted."); }} 
            className="flex items-center py-3 px-5 text-base text-red-800 dark:text-red-300 font-bold bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/60 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-700 border-2 border-red-300 dark:border-red-700"
          >
            <MapPin className="w-5 h-5 mr-2" aria-hidden="true"/> Clear Pins & Notes
          </button>
          <div className="w-0.5 h-8 bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
          <button 
            onClick={() => { handleClearAllDrawings(); setActiveTool('cursor'); }} 
            className="flex items-center py-3 px-5 text-base text-red-800 dark:text-red-300 font-bold bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/60 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-700 border-2 border-red-300 dark:border-red-700"
          >
            <Eraser className="w-5 h-5 mr-2" aria-hidden="true"/> Clear Drawings
          </button>
        </div>
      )}

      {/* Pencil Sub-Toolbar */}
      {activeTool === 'draw' && viewMode !== 'list' && (
        <div className="absolute bottom-28 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-800 px-5 py-3 rounded-2xl shadow-xl border-2 border-slate-300 dark:border-slate-700 flex items-center space-x-4 z-[710]">
          
          <div className="flex items-center space-x-2 mr-2 border-r-2 border-slate-300 dark:border-slate-600 pr-4">
            <button onClick={handleUndo} disabled={drawHistory.length === 0} aria-label="Undo drawing" className="p-2 rounded-lg text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700">
              <Undo2 className="w-6 h-6" />
            </button>
            <button onClick={handleRedo} disabled={drawRedo.length === 0} aria-label="Redo drawing" className="p-2 rounded-lg text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700">
              <Redo2 className="w-6 h-6" />
            </button>
          </div>

          <div className="flex items-center space-x-3" role="group" aria-label="Pencil Colors">
            {['#334155', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6'].map(c => (
              <button 
                key={c} onClick={() => setDrawColor(c)} 
                aria-label={`Set color to ${c}`} aria-pressed={drawColor === c}
                className={`w-8 h-8 rounded-full border-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 transition-transform hover:scale-110 ${drawColor === c ? 'border-indigo-800 dark:border-indigo-300 scale-110' : 'border-transparent'}`} 
                style={{ backgroundColor: c }} 
              />
            ))}
            <div className="w-0.5 h-8 bg-slate-300 dark:bg-slate-600 mx-2" aria-hidden="true" />
            <input 
              type="color" value={drawColor} onChange={(e) => setDrawColor(e.target.value)} 
              className="w-10 h-10 rounded cursor-pointer border-2 border-slate-300 dark:border-slate-600 p-0 shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700" 
              aria-label="Custom Pencil Color" title="Custom Color" 
            />
          </div>
          <div className="w-0.5 h-8 bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
          <input 
            type="range" min="2" max="20" value={drawWidth} onChange={e => setDrawWidth(Number(e.target.value))} 
            className="w-32 accent-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700" 
            aria-label="Pencil Stroke Width" title="Stroke Width" 
          />
        </div>
      )}

      {/* Sticker Sub-Toolbar */}
      {activeTool === 'sticker' && viewMode !== 'list' && (
        <div className="absolute bottom-28 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl shadow-xl border-2 border-slate-300 dark:border-slate-700 flex items-center space-x-3 z-[710]">
          <div className="flex space-x-2 border-r-2 border-slate-300 dark:border-slate-600 pr-3" role="group" aria-label="Emoji Stickers">
            {['⭐', '💖', '🔥', '📍', '✅', '❌', '👀', '🎉', '🍎', '🎸'].map(emoji => (
              <button 
                key={emoji} onClick={() => { setSelectedEmoji(emoji); setSelectedStickerMode('emoji'); announce(`${emoji} sticker selected`); }} 
                aria-label={`${emoji} sticker`} aria-pressed={selectedStickerMode === 'emoji' && selectedEmoji === emoji}
                className={`p-2 text-2xl rounded-xl transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 border-2 ${selectedStickerMode === 'emoji' && selectedEmoji === emoji ? 'bg-slate-200 dark:bg-slate-700 border-indigo-700 scale-110' : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-600'}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="pl-1 flex items-center">
            <input type="file" accept="image/*" onChange={handleCustomStickerUpload} ref={customStickerInputRef} className="hidden" aria-hidden="true" />
            <button 
              onClick={() => customStickerInputRef.current.click()} 
              aria-label="Upload Custom Sticker Image" aria-pressed={selectedStickerMode === 'custom'}
              className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 border-2 ${selectedStickerMode === 'custom' ? 'bg-indigo-200 dark:bg-indigo-900 border-indigo-800 text-indigo-900 dark:text-indigo-100 shadow-inner' : 'text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border-transparent'}`}
            >
              {selectedStickerMode === 'custom' && customStickerSrc ? <img src={customStickerSrc} alt="Custom uploaded sticker" className="w-8 h-8 object-cover rounded-md drop-shadow-sm" /> : <Upload className="w-6 h-6" />}
              <span className="text-xs font-bold mt-1">Upload</span>
            </button>
          </div>
        </div>
      )}

      {/* MAIN TOOLBAR */}
      {viewMode !== 'list' && (
        <nav className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2 border-2 border-slate-300 dark:border-slate-700 z-[710]" aria-label="Drawing and Placement Tools">
          <ToolButton icon={MousePointer2} label="Select Tool" shortcut="V" active={activeTool === 'cursor'} onClick={() => handleToolChange('cursor', 'Select')} />
          <ToolButton icon={Hand} label="Pan Map Tool" shortcut="H" active={activeTool === 'hand'} onClick={() => handleToolChange('hand', 'Pan')} />
          <div className="w-0.5 h-12 bg-slate-300 dark:bg-slate-600 mx-3" aria-hidden="true" />
          <ToolButton icon={Pencil} label="Draw Tool" shortcut="D" active={activeTool === 'draw'} onClick={() => handleToolChange('draw', 'Draw')} color="text-slate-800 dark:text-slate-200" />
          <ToolButton icon={Eraser} label="Eraser Tool" shortcut="E" active={activeTool === 'eraser'} onClick={() => handleToolChange('eraser', 'Eraser')} color="text-slate-800 dark:text-slate-200" />
          <div className="w-0.5 h-12 bg-slate-300 dark:bg-slate-600 mx-3" aria-hidden="true" />
          <ToolButton icon={MapPin} label="Add Location Pin" shortcut="P" active={activeTool === 'pin'} onClick={() => handleToolChange('pin', 'Pin')} color="text-blue-800 dark:text-blue-300" />
          <ToolButton icon={StickyNote} label="Add Post-it Note" shortcut="N" active={activeTool === 'note'} onClick={() => handleToolChange('note', 'Note')} color="text-amber-900 dark:text-amber-300" />
          <ToolButton icon={ImageIcon} label="Add Image File" shortcut="I" active={activeTool === 'image'} onClick={() => handleToolChange('image', 'Image')} color="text-emerald-900 dark:text-emerald-300" />
          <ToolButton icon={Smile} label="Add Sticker or Emoji" shortcut="S" active={activeTool === 'sticker'} onClick={() => handleToolChange('sticker', 'Sticker')} color="text-pink-700 dark:text-pink-300" />
          <div className="w-0.5 h-12 bg-slate-300 dark:bg-slate-600 mx-3" aria-hidden="true" />
          <ToolButton icon={Trash2} label="Clear Canvas Options" active={activeTool === 'clear'} onClick={() => handleToolChange('clear', 'Clear')} color="text-red-800 dark:text-red-300" />
        </nav>
      )}

      {/* PROPERTIES SIDEBAR */}
      {selectedItem && (
        <aside 
          className="absolute top-6 right-6 bottom-6 w-[450px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border-2 border-slate-300 dark:border-slate-600 flex flex-col z-[800] overflow-hidden"
          role="dialog"
          aria-labelledby="properties-heading"
        >
          <div className="p-5 border-b-2 border-slate-300 dark:border-slate-700 flex justify-between items-center bg-slate-100 dark:bg-slate-900">
            <h2 id="properties-heading" className="font-bold text-lg text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center"><Layers className="w-6 h-6 mr-3" aria-hidden="true"/> Record Properties</h2>
            <button 
              onClick={() => { setSelectedId(null); announce("Properties closed"); }} 
              className="p-2 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700"
              aria-label="Close Properties"
            >
              <X className="w-6 h-6 text-slate-800 dark:text-slate-200" />
            </button>
          </div>
          
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="mb-8 space-y-5">
              <div className="flex space-x-4 items-start">
                {selectedItem.type !== 'sticker' && selectedItem.type !== 'image' && (
                  <input 
                    type="color" value={getItemColor(selectedItem)} 
                    onChange={(e) => updateItem(selectedItem.id, { color: e.target.value, groupId: null })} 
                    className="w-12 h-12 rounded cursor-pointer border-2 border-slate-300 dark:border-slate-600 shadow-sm mt-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700" 
                    aria-label="Item Color Picker"
                  />
                )}
                <div className="flex-1">
                  <label htmlFor="item-title" className="sr-only">Item Title</label>
                  <input 
                    id="item-title"
                    type="text" value={selectedItem.type === 'sticker' ? (selectedItem.emoji || selectedItem.title) : selectedItem.title} 
                    onChange={(e) => updateItem(selectedItem.id, selectedItem.type === 'sticker' ? { emoji: e.target.value, title: e.target.value } : { title: e.target.value })} 
                    className="text-3xl font-black border-b-2 border-transparent hover:border-slate-400 dark:hover:border-slate-500 focus:border-indigo-800 dark:focus:border-indigo-300 focus:outline-none w-full bg-transparent transition-colors text-slate-900 dark:text-white" 
                  />
                  {selectedItem.type === 'pin' && (
                    <>
                      <label htmlFor="item-address" className="sr-only">Item Address</label>
                      <input 
                        id="item-address"
                        type="text" value={selectedItem.address || ''} 
                        onChange={(e) => updateItem(selectedItem.id, { address: e.target.value })} 
                        placeholder="Enter Full Address" 
                        className="text-base text-slate-800 dark:text-slate-200 w-full bg-transparent mt-3 border-b-2 border-transparent hover:border-slate-400 dark:hover:border-slate-500 focus:border-indigo-800 dark:focus:border-indigo-300 focus:outline-none transition-colors" 
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* A11Y FIX: Adjustable Item Scaling Tool */}
            <div className="mb-8 p-4 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl border-2 border-indigo-200 dark:border-indigo-800">
              <label htmlFor="item-scale" className="text-sm font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider mb-3 flex items-center">
                <ZoomIn className="w-4 h-4 mr-2" /> Adjust Item Size ({Math.round((selectedItem.scale || 1) * 100)}%)
              </label>
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => { const ns = Math.max(0.5, (selectedItem.scale || 1) - 0.1); updateItem(selectedItem.id, { scale: ns }); announce(`Size decreased to ${Math.round(ns * 100)} percent`); }}
                  className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border-2 border-indigo-300 dark:border-indigo-600 text-indigo-800 dark:text-indigo-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 hover:bg-indigo-200 dark:hover:bg-indigo-700 transition-colors"
                  aria-label="Decrease item size"
                ><Minus className="w-5 h-5"/></button>
                <input 
                  id="item-scale"
                  type="range" min="0.5" max="5" step="0.1" 
                  value={selectedItem.scale || 1} 
                  onChange={(e) => updateItem(selectedItem.id, { scale: parseFloat(e.target.value) })}
                  className="flex-1 accent-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700"
                  aria-label="Adjust item size slider"
                />
                <button 
                  onClick={() => { const ns = Math.min(5, (selectedItem.scale || 1) + 0.1); updateItem(selectedItem.id, { scale: ns }); announce(`Size increased to ${Math.round(ns * 100)} percent`); }}
                  className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border-2 border-indigo-300 dark:border-indigo-600 text-indigo-800 dark:text-indigo-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 hover:bg-indigo-200 dark:hover:bg-indigo-700 transition-colors"
                  aria-label="Increase item size"
                ><Plus className="w-5 h-5" /></button>
              </div>
            </div>

            {selectedItem.type === 'image' && (
              <div className="mb-8 border-4 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center hover:bg-slate-100 dark:hover:bg-slate-700/30 transition-colors">
                {selectedItem.src ? (
                  <div className="relative group">
                    <img src={selectedItem.src} alt="User uploaded" className="w-full h-auto rounded-lg max-h-48 object-contain" />
                    <button 
                      onClick={() => updateItem(selectedItem.id, { src: null })} 
                      className="absolute top-2 right-2 bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg opacity-0 group-hover:opacity-100 shadow-md text-red-800 dark:text-red-300 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-700"
                      aria-label="Remove Image"
                    >
                      <X className="w-6 h-6"/>
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-slate-600 dark:text-slate-300 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4">Upload an image file</p>
                    <input type="file" accept="image/*" onChange={handleImageUpload} ref={fileInputRef} className="hidden" aria-hidden="true" />
                    <button 
                      onClick={() => fileInputRef.current.click()} 
                      className="text-base bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100 px-5 py-3 rounded-lg font-black hover:bg-indigo-200 dark:hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 border-2 border-indigo-300 dark:border-indigo-700"
                      aria-label="Choose File to Upload"
                    >
                      Choose File
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-6">
              {selectedItem.fields.map((field) => (
                <div key={field.id} className="group relative bg-slate-100 dark:bg-slate-900 p-4 rounded-xl border-2 border-slate-300 dark:border-slate-700 focus-within:ring-4 focus-within:ring-indigo-500">
                   <div className="flex items-center justify-between mb-3">
                     <label htmlFor={`field-${field.id}`} className="text-lg font-extrabold text-slate-900 dark:text-slate-100">{field.name}</label>
                     <button 
                        onClick={() => { const newFields = selectedItem.fields.filter(f => f.id !== field.id); updateItem(selectedItem.id, { fields: newFields }); announce(`Field ${field.name} deleted`); }} 
                        className="text-red-800 dark:text-red-300 hover:text-red-900 dark:hover:text-red-200 hover:bg-red-200 dark:hover:bg-red-900/50 p-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-700 rounded-lg"
                        aria-label={`Delete ${field.name} field`}
                      >
                        <Trash2 className="w-6 h-6" />
                      </button>
                   </div>
                  {field.type === 'text' && <textarea id={`field-${field.id}`} value={field.value} onChange={(e) => updateItem(selectedItem.id, { fields: selectedItem.fields.map(f => f.id === field.id ? { ...f, value: e.target.value } : f) })} className="w-full bg-white dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-500 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-4 focus:ring-indigo-700 resize-none text-slate-900 dark:text-white" rows="3" />}
                  {field.type === 'number' && <input id={`field-${field.id}`} type="number" value={field.value} onChange={(e) => updateItem(selectedItem.id, { fields: selectedItem.fields.map(f => f.id === field.id ? { ...f, value: e.target.value } : f) })} className="w-full bg-white dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-500 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-4 focus:ring-indigo-700 text-slate-900 dark:text-white" />}
                  {field.type === 'boolean' && <input id={`field-${field.id}`} type="checkbox" checked={field.value} onChange={(e) => updateItem(selectedItem.id, { fields: selectedItem.fields.map(f => f.id === field.id ? { ...f, value: e.target.checked } : f) })} className="rounded accent-indigo-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 w-8 h-8 border-2 border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-800" />}
                </div>
              ))}
            </div>
            
            <div className="mt-8 pt-6 border-t-2 border-slate-300 dark:border-slate-700">
              <div className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4 uppercase tracking-wider">Add Property</div>
              <div className="grid grid-cols-2 gap-3">
                <FieldTypeButton icon={<AlignLeft className="w-5 h-5" />} label="Text" onClick={() => updateItem(selectedItem.id, { fields: [...selectedItem.fields, { id: generateId(), name: 'New Text', type: 'text', value: '' }] })} />
                <FieldTypeButton icon={<Hash className="w-5 h-5" />} label="Number" onClick={() => updateItem(selectedItem.id, { fields: [...selectedItem.fields, { id: generateId(), name: 'New Number', type: 'number', value: '' }] })} />
                <FieldTypeButton icon={<CheckSquare className="w-5 h-5" />} label="Checkbox" onClick={() => updateItem(selectedItem.id, { fields: [...selectedItem.fields, { id: generateId(), name: 'New Checkbox', type: 'boolean', value: false }] })} />
              </div>
            </div>
          </div>
          
          <div className="p-5 border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
            <button onClick={() => deleteItem(selectedItem.id)} className="w-full py-4 text-lg text-red-800 dark:text-red-300 font-bold bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/60 rounded-xl transition-colors flex items-center justify-center space-x-3 border-2 border-red-300 dark:border-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-700">
              <Trash2 className="w-6 h-6" aria-hidden="true" /><span>Delete This Record</span>
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

// --- SUB-COMPONENTS ---
const ViewButton = ({ icon: Icon, label, active, onClick, shortcut }) => {
  const ariaLabelText = [label, shortcut && `(Shortcut: ${shortcut})`].filter(Boolean).join(' ');
  return (
    <button 
      onClick={onClick} 
      aria-pressed={active}
      aria-keyshortcuts={shortcut}
      aria-label={ariaLabelText}
      className={`p-2 px-4 rounded-xl flex items-center space-x-2 transition-all text-base font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 border-2 ${active ? 'bg-indigo-200 text-indigo-900 border-indigo-400 dark:bg-indigo-900/50 dark:text-indigo-100 dark:border-indigo-600' : 'bg-transparent text-slate-800 hover:bg-slate-200 border-transparent hover:border-slate-400 dark:text-slate-200 dark:hover:bg-slate-700'}`}
    >
      <Icon className="w-5 h-5" aria-hidden="true" />
      <span className="hidden md:inline">{label}</span>
      {shortcut && <span className="ml-2 text-base font-bold bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2 py-1 rounded" aria-hidden="true">{shortcut}</span>}
    </button>
  );
};

const MapStyleMenuItem = ({ icon: Icon, label, active, onClick }) => (
  <button 
    role="menuitem"
    onClick={onClick} 
    aria-current={active ? "true" : "false"}
    className={`w-full px-4 py-3 flex items-center space-x-3 text-base transition-colors focus-visible:outline-none focus-visible:bg-indigo-100 dark:focus-visible:bg-indigo-900/30 focus-visible:ring-inset focus-visible:ring-4 focus-visible:ring-indigo-700 ${active ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-900 dark:text-indigo-100 font-extrabold' : 'text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white font-medium'}`}
  >
    <Icon className="w-5 h-5" aria-hidden="true" />
    <span>{label}</span>
  </button>
);

const ToolButton = ({ icon: Icon, label, active, onClick, color = "text-slate-800 dark:text-slate-200", shortcut }) => {
  const ariaLabelText = [
    label,
    shortcut && `(Shortcut: ${shortcut})`,
    active && '- Currently Active'
  ].filter(Boolean).join(' ');

  return (
    <button 
      onClick={onClick} 
      aria-pressed={active}
      aria-label={ariaLabelText}
      aria-keyshortcuts={shortcut}
      className={`relative p-4 rounded-xl flex flex-col items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 border-2 ${active ? 'bg-indigo-200 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 shadow-inner border-indigo-600' : `hover:bg-slate-200 dark:hover:bg-slate-700 border-transparent ${color}`}`} 
    >
      <Icon className={`w-8 h-8 ${active ? 'text-indigo-900 dark:text-indigo-100' : ''}`} aria-hidden="true" />
      {shortcut && <span className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 text-sm font-bold bg-slate-300 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-0.5 rounded shadow-sm border border-slate-400 dark:border-slate-600" aria-hidden="true">{shortcut}</span>}
    </button>
  );
};

const FieldTypeButton = ({ icon, label, onClick }) => (
  <button 
    onClick={onClick} 
    className="flex items-center space-x-3 p-3 rounded-xl border-2 border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors text-slate-800 dark:text-slate-200 text-base font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700"
  >
    {icon}<span>{label}</span>
  </button>
);

// --- RENDER NODES ON CANVAS ---
const CanvasNode = ({ item, isSelected, effectiveColor, groupEmoji, positionStyle = {}, onClick, zoomScale = 1, onPointerDown }) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const ariaLabelText = [
    `${item.type} named ${item.title}.`,
    item.address && `Address: ${item.address}.`,
    item.lat && `Located at latitude ${item.lat.toFixed(2)}, longitude ${item.lng.toFixed(2)}.`,
    `Scale: ${Math.round((item.scale || 1) * 100)} percent.`,
    isSelected ? 'Currently selected. Use Arrow Keys to move.' : 'Press Enter to select and edit.'
  ].filter(Boolean).join(' ');

  const a11yProps = {
    role: "button",
    tabIndex: 0,
    "aria-label": ariaLabelText,
    "aria-pressed": isSelected,
    onClick: onClick,
    onKeyDown: handleKeyDown,
    onPointerDown: onPointerDown 
  };

  const finalScale = (item.scale || 1) * zoomScale;

  if (item.type === 'pin') {
    return (
      <div className="absolute z-10" style={{ left: positionStyle.left, top: positionStyle.top, transform: `translate(-50%, -100%) scale(${finalScale})`, transformOrigin: 'bottom center' }}>
        <div {...a11yProps} className={`cursor-pointer group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 rounded-full transition-transform ${isSelected ? 'scale-125 ring-4 ring-indigo-700' : 'hover:scale-110'}`} data-id={item.id}>
          
          {/* A11Y FIX: Rendering Emoji over pin for colorblind distinguishability with AAA contrast stroke */}
          <div className="relative">
            <MapPin className="w-14 h-14 filter drop-shadow-xl text-slate-900 dark:text-slate-100" strokeWidth={2.5} style={{ fill: effectiveColor }} aria-hidden="true" />
            {(groupEmoji || item.emoji) && (
              <div className="absolute top-[10px] left-1/2 -translate-x-1/2 w-6 h-6 bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-100 rounded-full flex items-center justify-center text-sm shadow-md" aria-hidden="true">
                {groupEmoji || item.emoji}
              </div>
            )}
          </div>
          
          <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-3 px-5 py-4 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-xl shadow-2xl border-2 border-slate-300 dark:border-slate-600 transition-all origin-bottom flex flex-col items-center min-w-[250px] whitespace-normal ${isSelected ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100'}`} style={{ transform: `scale(${1/zoomScale})` }}>
            <span className="text-xl font-black text-center leading-tight" style={{ color: effectiveColor }}>{item.title}</span>
            {item.address && <span className="text-base text-slate-800 dark:text-slate-200 mt-2 text-center font-medium leading-snug">{item.address}</span>}
          </div>
        </div>
      </div>
    );
  }

  if (item.type === 'note') {
    return (
      <div className="absolute z-10" style={{ left: positionStyle.left, top: positionStyle.top, transform: `translate(-50%, -50%) scale(${finalScale})`, transformOrigin: 'center center' }}>
        <div {...a11yProps} className={`cursor-pointer group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 rounded-full transition-transform ${isSelected ? 'scale-110 ring-4 ring-indigo-700' : 'hover:scale-105'}`} data-id={item.id}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl border-4 border-slate-900 dark:border-slate-100`} style={{ backgroundColor: effectiveColor }}>
            <StickyNote className="w-8 h-8 text-slate-900 dark:text-slate-100" aria-hidden="true" />
          </div>

          <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-4 border-2 border-black/10 dark:border-white/10 shadow-2xl transition-all origin-bottom ${isSelected ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100'}`} style={{ backgroundColor: effectiveColor, width: '250px', minHeight: '250px', padding: '20px', transform: `scale(${1/zoomScale})` }}>
            <div className="absolute bottom-0 right-0 w-0 h-0 border-solid border-l-transparent border-t-transparent border-l-[24px] border-t-[24px] border-black/20 dark:border-white/20" />
            <h3 className="font-extrabold text-xl text-black/90 mb-3 leading-tight whitespace-normal">{item.title}</h3>
            <div className="space-y-2 mt-4">
              {item.fields.slice(0, 3).map(field => (
                <div key={field.id} className="text-base font-medium leading-snug text-black/90 break-words border-b border-black/20 pb-1">
                  <span className="font-black">{field.name}:</span> {field.type === 'boolean' ? (field.value ? 'Yes' : 'No') : field.value}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (item.type === 'image') {
    return (
      <div className="absolute z-10" style={{ left: positionStyle.left, top: positionStyle.top, transform: `translate(-50%, -50%) scale(${finalScale})`, transformOrigin: 'center center' }}>
        <div {...a11yProps} className={`cursor-pointer transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 bg-white dark:bg-slate-800 p-3 rounded-2xl border-2 border-slate-300 dark:border-slate-600 shadow-xl ${isSelected ? 'scale-110 ring-4 ring-indigo-700' : 'hover:scale-105'}`} style={{ width: '250px' }} data-id={item.id}>
          {item.src ? (
            <img src={item.src} alt="" className="w-full h-auto rounded-xl object-cover mb-3 pointer-events-none" style={{ maxHeight: '180px' }} />
          ) : (
            <div className="w-full h-32 bg-slate-200 dark:bg-slate-700 rounded-xl flex flex-col items-center justify-center mb-3 text-slate-800 dark:text-slate-200">
              <ImageIcon className="w-8 h-8 mb-2" aria-hidden="true" />
              <span className="text-xs uppercase font-black tracking-wider">No Image</span>
            </div>
          )}
          <h3 className="font-black text-base text-slate-900 dark:text-slate-100 text-center truncate px-2" style={{ color: effectiveColor }}>{item.title}</h3>
        </div>
      </div>
    );
  }

  if (item.type === 'sticker') {
    return (
      <div className="absolute z-10" style={{ left: positionStyle.left, top: positionStyle.top, transform: `translate(-50%, -50%) scale(${finalScale})`, transformOrigin: 'center center' }}>
        <div {...a11yProps} className={`flex items-center justify-center cursor-pointer transition-transform shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-700 ${isSelected ? 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-full scale-110 ring-4 ring-indigo-700' : 'hover:scale-105'}`} style={{ fontSize: '64px', width: '80px', height: '80px' }} data-id={item.id}>
          {item.src ? <img src={item.src} alt="" className="w-full h-full object-contain drop-shadow-lg pointer-events-none" /> : (item.emoji || item.title)}
        </div>
      </div>
    );
  }

  return null;
};
