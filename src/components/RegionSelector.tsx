import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { regions } from '../data/regions';

interface RegionSelectorProps {
  selectedRegion: number;
  onRegionChange: (regionId: number) => void;
  // Tailwind margin-top class for the dropdown (e.g., 'mt-2' default, or 'mt-12' for mobile header)
  dropdownOffsetClass?: string;
}

const RegionSelector: React.FC<RegionSelectorProps> = ({ selectedRegion, onRegionChange, dropdownOffsetClass = 'mt-2' }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedLabel = selectedRegion === 0
    ? 'Tüm Bölgeler'
    : (regions.find(r => r.id === selectedRegion)?.name ?? String(selectedRegion));

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const toggleOpen = () => setOpen(o => !o);

  const handleSelect = (id: number) => {
    onRegionChange(id);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative block w-full text-left">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleOpen}
        className="inline-flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-150 w-full shadow-sm"
      >
        <span className="truncate w-full text-left">{selectedLabel}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 ml-2" /> : <ChevronDown className="w-4 h-4 text-gray-400 ml-2" />}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-activedescendant={String(selectedRegion)}
          className={`absolute left-0 z-50 ${dropdownOffsetClass} bg-white border border-gray-200 rounded-lg shadow-lg py-1 overflow-auto max-h-56 w-full`}
        >
          <li
            role="option"
            aria-selected={selectedRegion === 0}
            tabIndex={0}
            className={`px-4 py-2 text-sm cursor-pointer text-gray-700 hover:bg-gray-50 ${selectedRegion === 0 ? 'bg-blue-50 text-blue-600' : ''}`}
            onClick={() => handleSelect(0)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(0); }}
          >
            Tüm Bölgeler
          </li>

          {regions.map(region => (
            <li
              key={region.id}
              role="option"
              aria-selected={selectedRegion === region.id}
              tabIndex={0}
              className={`px-4 py-2 text-sm cursor-pointer text-gray-700 hover:bg-gray-50 ${selectedRegion === region.id ? 'bg-blue-50 text-blue-600' : ''}`}
              onClick={() => handleSelect(region.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(region.id); }}
            >
              {region.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RegionSelector;