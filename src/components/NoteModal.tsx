import React from 'react';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface NoteModalProps {
  isOpen: boolean;
  title?: string;
  note?: string | null;
  onClose: () => void;
}

const NoteModal: React.FC<NoteModalProps> = ({ isOpen, title = 'Not', note, onClose }) => {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]">
      <div className="bg-white w-full h-full flex flex-col overflow-hidden overscroll-contain">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 overscroll-contain bg-gray-50">
          {note && note.length > 0 ? (
            <div className="whitespace-pre-wrap text-sm text-gray-800">{note}</div>
          ) : (
            <div className="text-sm text-gray-500">Bu lokasyon için henüz bir not eklenmemiş.</div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 text-right bg-white">
          <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">Kapat</button>
        </div>
      </div>
    </div>
  );
};

export default NoteModal;
