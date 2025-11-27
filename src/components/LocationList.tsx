import React, { useState } from 'react';
import { Search, MapPin, Cpu, Database, Zap } from 'lucide-react';
import { Location } from '../data/regions';
import { fieldsMatchQuery } from '../lib/search';

interface LocationListProps {
  locations: Location[];
  onLocationSelect: (location: Location) => void;
  onLocationDoubleClick?: (location: Location) => void;
  onShowDetails?: (location: Location) => void;
}

const LocationList: React.FC<LocationListProps> = ({ locations, onLocationSelect, onLocationDoubleClick, onShowDetails }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLocations = locations.filter(location =>
    fieldsMatchQuery(searchTerm, location.name, location.center, location.id)
  );

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Lokasyonlar</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Lokasyon ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {filteredLocations.map((location) => (
          <div
            key={location.id}
            className="p-4 border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors duration-150"
            onClick={() => onShowDetails ? onShowDetails(location) : onLocationSelect(location)}
            onDoubleClick={() => {
              console.log('Liste çift tıklama:', location.name);
              onLocationDoubleClick?.(location);
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center mb-2">
                  <MapPin className="w-4 h-4 text-gray-500 mr-2 flex-shrink-0" />
                  <h4 className="font-medium text-gray-900 text-sm">{location.name}</h4>
                </div>
                
                <div className="text-xs text-gray-600 mb-2">
                  <span className="font-medium">Merkez:</span> {location.center}
                </div>
                
                <div className="text-xs text-gray-600 mb-2">
                  <Cpu className="w-3 h-3 inline mr-1" />
                  {location.brand} - {location.model}
                </div>
                
                <div className="flex items-center space-x-3 text-xs">
                  <span className={`flex items-center ${location.details.hasRTU ? 'text-green-600' : 'text-red-500'}`}>
                    <Database className="w-3 h-3 mr-1" />
                    RTU
                  </span>
                  <span className={`flex items-center ${location.details.hasGPS ? 'text-green-600' : 'text-red-500'}`}>
                    <Zap className="w-3 h-3 mr-1" />
                    GPS
                  </span>
                </div>
              </div>
              
              <div className={`w-3 h-3 rounded-full ${
                location.details.isActive 
                  ? 'bg-green-500' 
                  : location.details.isConfigured 
                    ? 'bg-yellow-500' 
                    : 'bg-red-500'
              }`} />
            </div>
          </div>
        ))}
        
        {filteredLocations.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <Search className="w-8 h-8 mx-auto mb-3 text-gray-400" />
            <p>Aradığınız kriterlere uygun lokasyon bulunamadı.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationList;