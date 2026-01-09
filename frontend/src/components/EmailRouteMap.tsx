/**
 * メール経路の世界地図表示コンポーネント
 * ReceivedヘッダーのIPアドレスから位置情報を取得し、地図上に経路を表示
 */

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Header } from '../utils/emlParser';

// Leafletのデフォルトアイコンの問題を修正
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// デフォルトアイコンを設定
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface EmailRouteMapProps {
  headers: Header[];
}

interface GeoLocation {
  ip: string;
  lat: number;
  lon: number;
  city?: string;
  country?: string;
  org?: string;
  hopIndex: number;
  hostname?: string;
}

// カスタムマーカーアイコン
const createCustomIcon = (color: string, label: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        color: white;
        font-size: 12px;
      ">${label}</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

// 地図の境界を自動調整するコンポーネント
function FitBounds({ locations }: { locations: GeoLocation[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length > 0) {
      const bounds = L.latLngBounds(locations.map(loc => [loc.lat, loc.lon]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 });
    }
  }, [locations, map]);

  return null;
}

/**
 * ReceivedヘッダーからIPアドレスを抽出
 */
function extractIPsFromHeaders(headers: Header[]): { ip: string; hostname?: string }[] {
  const receivedHeaders = headers.filter(h => h.key.toLowerCase() === 'received');
  const ips: { ip: string; hostname?: string }[] = [];
  const seenIps = new Set<string>();

  // IPv4の正規表現
  const ipv4Regex = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;

  // Receivedヘッダーは逆順（最新が最初）なので、反転して処理
  const reversedHeaders = [...receivedHeaders].reverse();

  for (const header of reversedHeaders) {
    const value = header.value;

    // fromの後のIPを抽出
    const fromMatch = value.match(/from\s+([^\s(]+)/i);
    const hostname = fromMatch?.[1];

    // IPアドレスを抽出
    const matches = value.match(ipv4Regex);
    if (matches) {
      for (const ip of matches) {
        // プライベートIP、ローカルホスト、特殊IPを除外
        if (!isPrivateIP(ip) && !seenIps.has(ip)) {
          seenIps.add(ip);
          ips.push({ ip, hostname });
        }
      }
    }
  }

  return ips;
}

/**
 * プライベートIPかどうかをチェック
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true;

  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 127.0.0.0/8 (localhost)
  if (parts[0] === 127) return true;
  // 0.0.0.0
  if (parts.every(p => p === 0)) return true;
  // 255.255.255.255
  if (parts.every(p => p === 255)) return true;

  return false;
}

/**
 * IPアドレスから位置情報を取得
 */
async function fetchGeoLocation(ip: string, hopIndex: number, hostname?: string): Promise<GeoLocation | null> {
  try {
    // ipapi.co（HTTPS対応、月1000リクエストまで無料）
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    const data = await response.json();

    if (data.latitude && data.longitude && !data.error) {
      return {
        ip,
        lat: data.latitude,
        lon: data.longitude,
        city: data.city,
        country: data.country_name,
        org: data.org,
        hopIndex,
        hostname,
      };
    }

    // フォールバック: ip-api.com（HTTPSプロキシ経由）
    // Note: 本番環境ではWorker経由でプロキシするのが望ましい
    const fallbackResponse = await fetch(`https://ipwho.is/${ip}`);
    const fallbackData = await fallbackResponse.json();

    if (fallbackData.success !== false && fallbackData.latitude) {
      return {
        ip,
        lat: fallbackData.latitude,
        lon: fallbackData.longitude,
        city: fallbackData.city,
        country: fallbackData.country,
        org: fallbackData.connection?.org,
        hopIndex,
        hostname,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function EmailRouteMap({ headers }: EmailRouteMapProps) {
  const [locations, setLocations] = useState<GeoLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ipData = extractIPsFromHeaders(headers);

  const loadGeoData = async () => {
    if (ipData.length === 0) {
      setError('IPアドレスが見つかりませんでした');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await Promise.all(
        ipData.map((data, index) => fetchGeoLocation(data.ip, index + 1, data.hostname))
      );

      const validLocations = results.filter((loc): loc is GeoLocation => loc !== null);

      if (validLocations.length === 0) {
        setError('位置情報を取得できませんでした');
      } else {
        setLocations(validLocations);
      }
    } catch {
      setError('位置情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // IPがない場合は何も表示しない
  if (ipData.length === 0) {
    return null;
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">
          メール経路マップ
        </h3>
        {!loading && locations.length === 0 && (
          <button
            onClick={loadGeoData}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition-colors"
          >
            地図を表示
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2" />
            <p className="text-xs text-gray-400">位置情報を取得中...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded text-xs text-red-300">
          {error}
        </div>
      )}

      {!loading && locations.length > 0 && (
        <>
          <div className="h-64 rounded-lg overflow-hidden">
            <MapContainer
              center={[30, 0]}
              zoom={2}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />

              {/* 経路線 */}
              {locations.length > 1 && (
                <Polyline
                  positions={locations.map(loc => [loc.lat, loc.lon])}
                  color="#3B82F6"
                  weight={2}
                  opacity={0.8}
                  dashArray="5, 10"
                />
              )}

              {/* マーカー */}
              {locations.map((loc, index) => {
                const isFirst = index === 0;
                const isLast = index === locations.length - 1;
                const color = isFirst ? '#22C55E' : isLast ? '#EF4444' : '#3B82F6';
                const label = isFirst ? 'S' : isLast ? 'E' : String(index + 1);

                return (
                  <Marker
                    key={loc.ip}
                    position={[loc.lat, loc.lon]}
                    icon={createCustomIcon(color, label)}
                  >
                    <Popup>
                      <div className="text-xs">
                        <p className="font-bold text-gray-800">
                          ホップ {loc.hopIndex}
                          {isFirst && ' (送信元)'}
                          {isLast && ' (最終)'}
                        </p>
                        <p className="font-mono text-gray-600">{loc.ip}</p>
                        {loc.hostname && (
                          <p className="text-gray-500">{loc.hostname}</p>
                        )}
                        <p className="text-gray-700">
                          {loc.city && `${loc.city}, `}{loc.country}
                        </p>
                        {loc.org && (
                          <p className="text-gray-500 text-xs">{loc.org}</p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              <FitBounds locations={locations} />
            </MapContainer>
          </div>

          {/* 凡例 */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>送信元</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>中継</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span>最終</span>
            </div>
          </div>

          {/* ホップリスト */}
          <div className="mt-3 space-y-1">
            {locations.map((loc) => (
              <div key={loc.ip} className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 w-8">#{loc.hopIndex}</span>
                <span className="font-mono text-gray-300">{loc.ip}</span>
                <span className="text-gray-500">→</span>
                <span className="text-gray-400">
                  {loc.city && `${loc.city}, `}{loc.country}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* IPリスト（未読み込み時） */}
      {!loading && locations.length === 0 && !error && (
        <div className="space-y-1 text-xs">
          <p className="text-gray-500 mb-2">検出されたIP ({ipData.length}件):</p>
          {ipData.map((data, index) => (
            <div key={data.ip} className="flex items-center gap-2">
              <span className="text-gray-500">#{index + 1}</span>
              <span className="font-mono text-gray-400">{data.ip}</span>
              {data.hostname && (
                <span className="text-gray-600">({data.hostname})</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
