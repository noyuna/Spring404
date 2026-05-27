import { useEffect, useRef, useState } from 'react';
import {
  GoogleMap,
  Marker,
  OverlayView,
  useJsApiLoader,
} from '@react-google-maps/api';

//const API_URL = 'http://localhost:8000';
const API_URL = 'http://10.240.190.46:8000';
const TMAP_APP_KEY = 'nuyqPazzHgQQvPLshJ7H8VukJqO9JDlEn2TqFMb0';

const LIBRARIES = ['places', 'geometry'];

const center = {
  lat: 37.5563,
  lng: 126.9236,
};

const mapStyle = {
  width: '100%',
  height: '100%',
};

const NEAR_ROUTE_DISTANCE_METER = 120;
const HOME_SHEET_HEIGHT = 120;
const PLACE_SHEET_HEIGHT = 300;
const ROUTE_SHEET_HEIGHT = 360;

const koreaBounds = {
  minLat: 33,
  maxLat: 39,
  minLng: 124,
  maxLng: 132,
};

function App() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: 'AIzaSyB9lB1dUQypTZTLyw8cM5MgpS4jxbCoPUk',
    libraries: LIBRARIES,
  });

  const [map, setMap] = useState(null);

  const [selectedPlace, setSelectedPlace] = useState(null);
  const [selectedSafetyScore, setSelectedSafetyScore] = useState(null);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviews, setReviews] = useState([]);

  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [routeCandidates, setRouteCandidates] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');

  const [myLocation, setMyLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [searchScreenOpen, setSearchScreenOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [sheetHeight, setSheetHeight] = useState(HOME_SHEET_HEIGHT);

  const routeLineRef = useRef(null);
  const routeGlowRef = useRef(null);
  const dragRef = useRef({
    dragging: false,
    startY: 0,
    startHeight: HOME_SHEET_HEIGHT,
  });

  const selectedRoute = routeCandidates[selectedRouteIndex];
  const isRouteView = routeCandidates.length > 0 || routeLoading || routeError;

  useEffect(() => {
    if (!map || !selectedRoute) {
      clearRouteLine();
      return;
    }

    clearRouteLine();

    routeGlowRef.current = new window.google.maps.Polyline({
      path: selectedRoute.path,
      map,
      strokeColor: '#ffffff',
      strokeWeight: 13,
      strokeOpacity: 0.9,
      zIndex: 8,
    });

    routeLineRef.current = new window.google.maps.Polyline({
      path: selectedRoute.path,
      map,
      strokeColor: '#15803d',
      strokeWeight: 6,
      strokeOpacity: 0.96,
      zIndex: 9,
    });
  }, [map, selectedRoute]);

  const clearRouteLine = () => {
    if (routeLineRef.current) {
      routeLineRef.current.setMap(null);
      routeLineRef.current = null;
    }

    if (routeGlowRef.current) {
      routeGlowRef.current.setMap(null);
      routeGlowRef.current = null;
    }
  };

  if (!isLoaded) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  const renderLocationBox = () => {
    return (
      <div style={locationBoxStyle}>
        <div style={locationLineStyle}>
          <span style={startDotStyle} />
          <span style={locationLabelStyle}>출발</span>
          <strong style={locationTextStyle}>
            {startPoint?.name || '출발지를 선택하세요'}
          </strong>
        </div>

        <div style={locationDividerStyle} />

        <div style={locationLineStyle}>
          <span style={endDotStyle} />
          <span style={locationLabelStyle}>도착</span>
          <strong style={locationTextStyle}>
            {endPoint?.name || '도착지를 선택하세요'}
          </strong>
        </div>
      </div>
    );
  };

  const isInKorea = (position) => {
    return (
      position.lat >= koreaBounds.minLat &&
      position.lat <= koreaBounds.maxLat &&
      position.lng >= koreaBounds.minLng &&
      position.lng <= koreaBounds.maxLng
    );
  };

  const getUserAverage = (arr) => {
    if (arr.length === 0) return '0.00';
    const sum = arr.reduce((acc, cur) => acc + Number(cur.user_score || 0), 0);
    return (sum / arr.length).toFixed(2);
  };

  const getAiAverage = (arr) => {
    if (arr.length === 0) return '5.00';
    const sum = arr.reduce((acc, cur) => acc + Number(cur.ai_score || 0), 0);
    return (sum / arr.length).toFixed(2);
  };

  const getDisplayedSafetyScore = () => {
    if (selectedSafetyScore !== null && selectedSafetyScore !== undefined) {
      return Number(selectedSafetyScore).toFixed(2);
    }

    return getAiAverage(reviews);
  };

  const getSafetyColor = (score) => {
    if (score >= 4) return '#16a34a';
    if (score >= 2.5) return '#f59e0b';
    return '#ef4444';
  };

  const fetchAllReviews = async () => {
    const res = await fetch(`${API_URL}/reviews`);
    if (!res.ok) throw new Error('서버 오류');
    return res.json();
  };

  const getReviewsNearPosition = async (position) => {
    const data = await fetchAllReviews();

    return data.filter(
      (r) =>
        Math.abs(Number(r.lat) - position.lat) < 0.001 &&
        Math.abs(Number(r.lng) - position.lng) < 0.001,
    );
  };

  const fetchSafetyScoreByPosition = async (position) => {
    const zoneRes = await fetch(
      `${API_URL}/zones/by-location?lat=${position.lat}&lng=${position.lng}`,
    );
    if (!zoneRes.ok) return null;

    const zone = await zoneRes.json();
    const scoreRes = await fetch(`${API_URL}/safety-score/${zone.zone_id}`);
    if (!scoreRes.ok) return null;

    return scoreRes.json();
  };

  const getPlaceDetailsByPlaceId = (placeId) => {
    return new Promise((resolve) => {
      const service = new window.google.maps.places.PlacesService(
        document.createElement('div'),
      );

      service.getDetails(
        {
          placeId,
          fields: [
            'name',
            'formatted_address',
            'icon',
            'icon_background_color',
          ],
        },
        (place, status) => {
          if (status === 'OK' && place?.name) {
            resolve({
              name: place.name,
              address: place.formatted_address || '',
              icon: place.icon || '',
              iconBackgroundColor: place.icon_background_color || '#ffffff',
            });
          } else {
            resolve({
              name: '',
              address: '',
              icon: '',
              iconBackgroundColor: '#ffffff',
            });
          }
        },
      );
    });
  };

  const getAddressByPosition = (position) => {
    return new Promise((resolve) => {
      const geocoder = new window.google.maps.Geocoder();

      geocoder.geocode({ location: position }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          resolve(results[0].formatted_address);
        } else {
          resolve(`${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`);
        }
      });
    });
  };

  const getLocationName = async (position, placeId) => {
    if (placeId) {
      const detail = await getPlaceDetailsByPlaceId(placeId);
      if (detail.name) return detail.name;
    }

    return getAddressByPosition(position);
  };

  const getDistanceFromRoute = (path, review) => {
    const reviewLatLng = new window.google.maps.LatLng(
      Number(review.lat),
      Number(review.lng),
    );

    let minDistance = Infinity;

    path.forEach((point) => {
      const routePoint = new window.google.maps.LatLng(point.lat, point.lng);
      const distance =
        window.google.maps.geometry.spherical.computeDistanceBetween(
          routePoint,
          reviewLatLng,
        );

      minDistance = Math.min(minDistance, distance);
    });

    return minDistance;
  };

  const analyzeRouteReviews = (path, allReviews) => {
    const nearReviews = allReviews.filter((review) => {
      return getDistanceFromRoute(path, review) <= NEAR_ROUTE_DISTANCE_METER;
    });

    return {
      nearReviews,
      nearReviewCount: nearReviews.length,
    };
  };

  const formatMeter = (meter) => {
    if (!meter && meter !== 0) return '-';
    if (meter >= 1000) return `${(meter / 1000).toFixed(1)}km`;
    return `${Math.round(meter)}m`;
  };

  const formatSecond = (second) => {
    if (!second && second !== 0) return '-';
    const min = Math.round(second / 60);
    if (min >= 60) {
      const hour = Math.floor(min / 60);
      const rest = min % 60;
      return `${hour}시간 ${rest}분`;
    }
    return `${min}분`;
  };

  const requestGoogleRoutes = (origin, destination, allReviews) => {
    return new Promise((resolve, reject) => {
      const directionsService = new window.google.maps.DirectionsService();

      directionsService.route(
        {
          origin: origin.position,
          destination: destination.position,
          travelMode: window.google.maps.TravelMode.WALKING,
          provideRouteAlternatives: true,
        },
        (result, status) => {
          if (status !== 'OK' || !result?.routes?.length) {
            reject(new Error(`경로를 찾을 수 없습니다. (${status})`));
            return;
          }

          const candidates = result.routes.map((route, index) => {
            const leg = route.legs?.[0];
            const path = (route.overview_path || []).map((point) => ({
              lat: point.lat(),
              lng: point.lng(),
            }));
            const reviewAnalysis = analyzeRouteReviews(path, allReviews);

            return {
              id: `google-${index}`,
              provider: 'google',
              name: route.summary || `경로 ${index + 1}`,
              distance: leg?.distance?.text || '-',
              duration: leg?.duration?.text || '-',
              distanceValue: leg?.distance?.value || 0,
              durationValue: leg?.duration?.value || 0,
              safetyScore: null,
              nearReviews: reviewAnalysis.nearReviews,
              nearReviewCount: reviewAnalysis.nearReviewCount,
              path,
            };
          });

          resolve(candidates);
        },
      );
    });
  };

  const requestTmapRouteByOption = async (
    origin,
    destination,
    option,
    optionName,
    allReviews,
  ) => {
    const body = {
      startX: String(origin.position.lng),
      startY: String(origin.position.lat),
      endX: String(destination.position.lng),
      endY: String(destination.position.lat),
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      startName: origin.name || 'start',
      endName: destination.name || 'end',
      searchOption: String(option),
    };

    const res = await fetch(
      'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json',
      {
        method: 'POST',
        headers: {
          appKey: TMAP_APP_KEY,
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      throw new Error('Tmap 경로 요청 실패');
    }

    const data = await res.json();
    const features = data.features || [];
    const path = [];

    features.forEach((feature) => {
      const geometry = feature.geometry;

      if (geometry?.type === 'LineString') {
        geometry.coordinates.forEach(([lng, lat]) => {
          path.push({ lat, lng });
        });
      }
    });

    if (path.length === 0) {
      throw new Error('Tmap 경로 좌표 없음');
    }

    const firstProperties = features[0]?.properties || {};
    const totalDistance = firstProperties.totalDistance;
    const totalTime = firstProperties.totalTime;
    const reviewAnalysis = analyzeRouteReviews(path, allReviews);

    return {
      id: `tmap-${option}`,
      provider: 'tmap',
      name: optionName,
      distance: formatMeter(totalDistance),
      duration: formatSecond(totalTime),
      distanceValue: totalDistance || 0,
      durationValue: totalTime || 0,
      safetyScore: null,
      nearReviews: reviewAnalysis.nearReviews,
      nearReviewCount: reviewAnalysis.nearReviewCount,
      path,
    };
  };

  const requestTmapRoutes = async (origin, destination, allReviews) => {
    const options = [
      { option: 0, name: '추천 경로' },
      { option: 4, name: '대로 우선' },
      { option: 10, name: '최단 경로' },
      { option: 30, name: '계단 제외' },
    ];

    const results = await Promise.allSettled(
      options.map((item) =>
        requestTmapRouteByOption(
          origin,
          destination,
          item.option,
          item.name,
          allReviews,
        ),
      ),
    );

    const successRoutes = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);

    const uniqueMap = new Map();

    successRoutes.forEach((route) => {
      const key = route.path
        .filter((_, idx) => idx % 8 === 0)
        .map((point) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`)
        .join('|');

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, route);
      }
    });

    return Array.from(uniqueMap.values());
  };

  const rankRoutesBySafety = async (candidates) => {
    const res = await fetch(`${API_URL}/routes/safety-rank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routes: candidates }),
    });

    if (!res.ok) {
      throw new Error('안전 경로 분석 실패');
    }

    const data = await res.json();
    return data.routes || candidates;
  };

  const requestRoutes = async (origin, destination) => {
    clearRouteLine();
    setRouteLoading(true);
    setRouteError('');
    setRouteCandidates([]);
    setSelectedRouteIndex(0);

    try {
      const allReviews = await fetchAllReviews();

      const useTmap =
        isInKorea(origin.position) && isInKorea(destination.position);

      const candidates = useTmap
        ? await requestTmapRoutes(origin, destination, allReviews)
        : await requestGoogleRoutes(origin, destination, allReviews);

      if (candidates.length === 0) {
        setRouteError('경로를 찾을 수 없습니다.');
        return;
      }

      let safetyRanked = candidates;

      try {
        safetyRanked = await rankRoutesBySafety(candidates);
      } catch (err) {
        console.error(err);
      }

      const sorted = safetyRanked.sort((a, b) => {
        if (a.safetyScore != null && b.safetyScore != null) {
          return (
            Number(b.safetyScore || 0) - Number(a.safetyScore || 0) ||
            Number(b.totalSafetyScore || 0) - Number(a.totalSafetyScore || 0)
          );
        }

        return a.durationValue - b.durationValue;
      });

      setRouteCandidates(sorted);
      setSelectedRouteIndex(0);
      setSheetHeight(ROUTE_SHEET_HEIGHT);

      if (map && sorted[0]?.path?.length) {
        const bounds = new window.google.maps.LatLngBounds();
        sorted[0].path.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds);
      }
    } catch (err) {
      console.error(err);
      setRouteError(err.message || '경로 분석 중 오류가 발생했습니다.');
    } finally {
      setRouteLoading(false);
    }
  };

  const resetRoute = () => {
    clearRouteLine();
    setStartPoint(null);
    setEndPoint(null);
    setRouteCandidates([]);
    setSelectedRouteIndex(0);
    setRouteError('');
    setRouteLoading(false);
  };

  const closeRouteView = () => {
    clearRouteLine();
    setStartPoint(null);
    setEndPoint(null);
    setRouteCandidates([]);
    setSelectedRouteIndex(0);
    setRouteError('');
    setRouteLoading(false);
    setSheetHeight(selectedPlace ? PLACE_SHEET_HEIGHT : HOME_SHEET_HEIGHT);

    if (selectedPlace) {
      focusPlaceOnMap(selectedPlace.position, PLACE_SHEET_HEIGHT);
    }
  };

  const resetPlaceAndRoute = () => {
    resetRoute();
    setSelectedPlace(null);
    setSelectedSafetyScore(null);
    setReviews([]);
    setReviewText('');
    setReviewRating(0);
    setSheetHeight(HOME_SHEET_HEIGHT);
  };

  const getCurrentPosition = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('브라우저에서 위치 기능을 지원하지 않습니다.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          reject(new Error('현재 위치를 가져올 수 없습니다.'));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        },
      );
    });
  };

  const moveToMyLocation = async () => {
    setLocationLoading(true);

    try {
      const current = await getCurrentPosition();
      setMyLocation(current);

      if (map) {
        map.panTo(current);
        map.setZoom(16);
      }

      return current;
    } catch (err) {
      alert(err.message);
      return null;
    } finally {
      setLocationLoading(false);
    }
  };

  const setPointAsStart = (point) => {
    clearRouteLine();
    setStartPoint(point);
    setEndPoint(null);
    setRouteCandidates([]);
    setSelectedRouteIndex(0);
    setRouteError('');
    setRouteLoading(false);
    setSheetHeight(PLACE_SHEET_HEIGHT);
    focusPlaceOnMap(point.position, PLACE_SHEET_HEIGHT);
  };

  const setPointAsEnd = async (point) => {
    let origin = startPoint;

    if (!origin) {
      const current = myLocation || (await moveToMyLocation());

      if (!current) return;

      origin = {
        id: 'my-location-start',
        name: '내 위치',
        position: current,
      };

      setStartPoint(origin);
    }

    setEndPoint(point);
    requestRoutes(origin, point);
  };

  const centerPositionInVisibleMap = (position, nextSheetHeight) => {
    if (!map) return;

    const projection = map.getProjection();
    const zoom = map.getZoom() || 16;

    if (!projection) {
      map.panTo(position);
      return;
    }

    const scale = 2 ** zoom;
    const latLng = new window.google.maps.LatLng(position.lat, position.lng);
    const point = projection.fromLatLngToPoint(latLng);

    if (!point) {
      map.panTo(position);
      return;
    }

    const centerPoint = new window.google.maps.Point(
      point.x,
      point.y + nextSheetHeight / 2 / scale,
    );

    const newCenter = projection.fromPointToLatLng(centerPoint);
    map.setCenter(newCenter);
  };

  const focusPlaceOnMap = (position, nextSheetHeight = PLACE_SHEET_HEIGHT) => {
    if (!map) return;

    map.setZoom(16);

    window.setTimeout(() => {
      centerPositionInVisibleMap(position, nextSheetHeight);
    }, 80);
  };

  const openPlaceDetail = async (point) => {
    setSelectedPlace(point);
    setSelectedSafetyScore(null);
    setReviewText('');
    setReviewRating(0);
    setSearchScreenOpen(false);
    setSheetHeight(PLACE_SHEET_HEIGHT);

    focusPlaceOnMap(point.position, PLACE_SHEET_HEIGHT);

    try {
      const filtered = await getReviewsNearPosition(point.position);
      setReviews(filtered);

      const safetyScore = await fetchSafetyScoreByPosition(point.position);
      setSelectedSafetyScore(safetyScore?.final_safety_score ?? null);
    } catch (err) {
      console.error(err);
      setReviews([]);
      setSelectedSafetyScore(null);
    }
  };

  const searchPlaces = () => {
    if (!searchText.trim()) {
      alert('검색어를 입력해주세요');
      return;
    }

    setSearchScreenOpen(true);
    setSearchLoading(true);
    setSearchError('');
    setSearchResults([]);

    const service = new window.google.maps.places.PlacesService(
      document.createElement('div'),
    );

    const location = map?.getCenter() || new window.google.maps.LatLng(center);

    service.textSearch(
      {
        query: searchText,
        location,
        radius: 20000,
      },
      (results, status) => {
        setSearchLoading(false);

        if (status !== window.google.maps.places.PlacesServiceStatus.OK) {
          setSearchError(`검색 결과가 없습니다. (${status})`);
          return;
        }

        const formatted = results
          .filter((place) => place.geometry?.location)
          .slice(0, 12)
          .map((place) => ({
            id: place.place_id || `${place.name}-${Date.now()}`,
            placeId: place.place_id,
            name: place.name || '이름 없는 장소',
            address: place.formatted_address || place.vicinity || '',
            icon: place.icon || '',
            iconBackgroundColor:
              place.icon_background_color ||
              place.iconBackgroundColor ||
              '#ffffff',
            position: {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            },
          }));

        setSearchResults(formatted);
      },
    );
  };

  const handleReviewPlaceSelect = async (e) => {
    if (!e.placeId || !e.latLng) return;

    e.stop();

    const position = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };

    const detail = await getPlaceDetailsByPlaceId(e.placeId);
    const fallbackName = await getLocationName(position, e.placeId);

    openPlaceDetail({
      id: Date.now(),
      placeId: e.placeId,
      name: detail.name || fallbackName,
      address: detail.address,
      icon: detail.icon,
      iconBackgroundColor: detail.iconBackgroundColor,
      position,
    });
  };

  const saveReview = async () => {
    if (!selectedPlace) return;

    if (reviewRating === 0) {
      alert('별점을 선택해주세요');
      return;
    }

    if (!reviewText.trim()) {
      alert('리뷰를 입력해주세요');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: reviewText,
          lat: selectedPlace.position.lat,
          lng: selectedPlace.position.lng,
          user_score: reviewRating,
        }),
      });

      if (!res.ok) throw new Error('서버 오류');

      const result = await res.json();

      setReviews((prev) => [...prev, result.data]);
      setSelectedSafetyScore(result.data.final_safety_score ?? null);
      setReviewText('');
      setReviewRating(0);

      alert('저장됨!');
    } catch (err) {
      console.error(err);
      alert('저장 실패');
    }
  };

  const getPinIcon = (color) => {
    return {
      path: 'M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7z',
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 1.9,
      anchor: new window.google.maps.Point(12, 22),
      labelOrigin: new window.google.maps.Point(12, 8.5),
    };
  };

  const getMyLocationIcon = () => {
    return {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: '#2563eb',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3,
    };
  };

  const handlePlaceIconError = (e) => {
    e.currentTarget.style.display = 'none';

    const fallback = e.currentTarget.nextElementSibling;
    if (fallback) {
      fallback.style.display = 'inline';
    }
  };

  const startDrag = (e) => {
    dragRef.current = {
      dragging: true,
      startY: e.clientY,
      startHeight: sheetHeight,
    };
  };

  const moveDrag = (e) => {
    if (!dragRef.current.dragging) return;

    const diff = dragRef.current.startY - e.clientY;
    const nextHeight = dragRef.current.startHeight + diff;
    const maxHeight = window.innerHeight * 0.82;
    const minHeight = selectedPlace || isRouteView ? 260 : 110;

    setSheetHeight(Math.min(maxHeight, Math.max(minHeight, nextHeight)));
  };

  const endDrag = () => {
    dragRef.current.dragging = false;
  };

  const closeSearch = () => {
    setSearchScreenOpen(false);
    setSearchError('');
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        backgroundColor: '#e5e7eb',
        display: 'flex',
        justifyContent: 'center',
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '430px',
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: '#f8fafc',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            zIndex: 30,
            display: 'flex',
            gap: 8,
          }}
        >
          <input
            value={searchText}
            onFocus={() => setSearchScreenOpen(true)}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') searchPlaces();
            }}
            placeholder="장소 검색"
            style={{
              flex: 1,
              height: 44,
              border: 'none',
              borderRadius: 14,
              padding: '0 14px',
              fontSize: 15,
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
              outline: 'none',
            }}
          />

          <button
            onClick={searchPlaces}
            style={{
              width: 58,
              border: 'none',
              borderRadius: 14,
              backgroundColor: '#14532d',
              color: 'white',
              fontWeight: 800,
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
            }}
          >
            검색
          </button>
        </div>

        {searchScreenOpen && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 25,
              backgroundColor: '#f8fafc',
              padding: '72px 14px 20px',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <strong style={{ fontSize: 18 }}>검색 결과</strong>
              <button
                onClick={closeSearch}
                style={{
                  border: 'none',
                  backgroundColor: '#e5e7eb',
                  borderRadius: 999,
                  padding: '8px 12px',
                  fontWeight: 700,
                }}
              >
                닫기
              </button>
            </div>

            {searchLoading && <p>검색 중...</p>}
            {searchError && <p style={{ color: '#ef4444' }}>{searchError}</p>}

            {searchResults.map((place) => (
              <button
                key={place.id}
                onClick={() => openPlaceDetail(place)}
                style={{
                  width: '100%',
                  display: 'block',
                  textAlign: 'left',
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 10,
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 16,
                    fontWeight: 800,
                    color: '#111827',
                    marginBottom: 4,
                  }}
                >
                  {place.icon ? (
                    <>
                      <img
                        src={place.icon}
                        alt=""
                        onError={handlePlaceIconError}
                        style={{
                          width: 18,
                          height: 18,
                        }}
                      />
                      <span style={{ display: 'none' }}>📍</span>
                    </>
                  ) : (
                    <span>📍</span>
                  )}
                  <span>{place.name}</span>
                </div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  {place.address || '주소 정보 없음'}
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{ position: 'absolute', inset: 0 }}>
          <GoogleMap
            mapContainerStyle={mapStyle}
            center={center}
            zoom={16}
            options={{
              clickableIcons: true,
              fullscreenControl: false,
              streetViewControl: false,
              mapTypeControl: false,
              zoomControl: false,
            }}
            onLoad={(mapInstance) => setMap(mapInstance)}
            onClick={handleReviewPlaceSelect}
          >
            {myLocation && (
              <>
                <OverlayView
                  position={myLocation}
                  mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                  getPixelPositionOffset={() => ({
                    x: -22,
                    y: -22,
                  })}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 999,
                      backgroundColor: 'rgba(37, 99, 235, 0.16)',
                      boxShadow:
                        '0 0 12px rgba(37, 99, 235, 0.55), 0 0 28px rgba(37, 99, 235, 0.28)',
                      border: '1px solid rgba(37, 99, 235, 0.28)',
                    }}
                  />
                </OverlayView>

                <Marker
                  position={myLocation}
                  icon={getMyLocationIcon()}
                  title="내 위치"
                  zIndex={30}
                />
              </>
            )}

            {selectedPlace && !isRouteView && (
              <>
                <OverlayView
                  position={selectedPlace.position}
                  mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                  getPixelPositionOffset={() => ({
                    x: -22,
                    y: -48,
                  })}
                >
                  <button
                    onClick={() => openPlaceDetail(selectedPlace)}
                    style={{
                      width: 44,
                      height: 44,
                      border: 'none',
                      borderRadius: '50% 50% 50% 0',
                      backgroundColor: '#14532d',
                      transform: 'rotate(-45deg)',
                      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.28)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 25,
                        height: 25,
                        borderRadius: 999,
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: 'rotate(45deg)',
                        overflow: 'hidden',
                      }}
                    >
                      {selectedPlace.icon ? (
                        <>
                          <img
                            src={selectedPlace.icon}
                            alt=""
                            onError={handlePlaceIconError}
                            style={{
                              width: 17,
                              height: 17,
                            }}
                          />
                          <span style={{ display: 'none', fontSize: 14 }}>
                            📍
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 14 }}>📍</span>
                      )}
                    </span>
                  </button>
                </OverlayView>

                <OverlayView
                  position={selectedPlace.position}
                  mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                  getPixelPositionOffset={() => ({
                    x: 0,
                    y: 18,
                  })}
                >
                  <div
                    style={{
                      display: 'inline-block',
                      width: 'max-content',
                      maxWidth: 240,
                      transform: 'translateX(-50%)',
                      backgroundColor: '#ffffff',
                      color: '#111827',
                      border: '1px solid #e5e7eb',
                      borderRadius: 999,
                      padding: '6px 12px',
                      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.18)',
                      fontSize: 12,
                      fontWeight: 900,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {selectedPlace.name}
                  </div>
                </OverlayView>
              </>
            )}

            {startPoint && (
              <Marker
                position={startPoint.position}
                icon={getPinIcon('#2563eb')}
                label={{
                  text: '출발',
                  color: '#ffffff',
                  fontWeight: '900',
                  fontSize: '9px',
                }}
                title={`출발: ${startPoint.name}`}
              />
            )}

            {endPoint && (
              <Marker
                position={endPoint.position}
                icon={getPinIcon('#ef4444')}
                label={{
                  text: '도착',
                  color: '#ffffff',
                  fontWeight: '900',
                  fontSize: '9px',
                }}
                title={`도착: ${endPoint.name}`}
              />
            )}
          </GoogleMap>
        </div>

        <button
          onClick={moveToMyLocation}
          disabled={locationLoading}
          aria-label="내 위치"
          style={{
            position: 'absolute',
            right: 14,
            bottom: sheetHeight + 16,
            zIndex: 22,
            width: 44,
            height: 44,
            borderRadius: 999,
            border: '1px solid #dfe3ea',
            backgroundColor: '#ffffff',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: locationLoading ? 'default' : 'pointer',
            opacity: locationLoading ? 0.65 : 1,
            padding: 0,
          }}
        >
          <span
            style={{
              position: 'relative',
              width: 20,
              height: 20,
              border: '2px solid #4b5563',
              borderRadius: 999,
              display: 'block',
              boxSizing: 'border-box',
            }}
          >
            <span style={targetLineTopStyle} />
            <span style={targetLineBottomStyle} />
            <span style={targetLineLeftStyle} />
            <span style={targetLineRightStyle} />
            <span style={targetDotStyle} />
          </span>
        </button>

        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
            height: sheetHeight,
            backgroundColor: 'white',
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            boxShadow: '0 -10px 30px rgba(15, 23, 42, 0.2)',
            padding: '10px 16px 18px',
            overflowY: 'auto',
          }}
        >
          <div
            onPointerDown={startDrag}
            style={{
              width: 46,
              height: 5,
              borderRadius: 999,
              backgroundColor: '#d1d5db',
              margin: '0 auto 12px',
              cursor: 'grab',
            }}
          />

          {isRouteView ? (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginBottom: 10,
                }}
              >
                <button
                  onClick={closeRouteView}
                  style={{
                    border: 'none',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    borderRadius: 999,
                    padding: '8px 11px',
                    fontWeight: 800,
                  }}
                >
                  닫기
                </button>
              </div>

              <div style={{ marginBottom: 18 }}>{renderLocationBox()}</div>

              <div
                style={{
                  textAlign: 'center',
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#111827',
                  marginBottom: 16,
                }}
              >
                추천 경로
              </div>

              {routeLoading && <p style={noticeStyle}>안전 경로 분석 중...</p>}

              {routeError && (
                <p style={{ ...noticeStyle, color: '#ef4444' }}>{routeError}</p>
              )}

              {routeCandidates.map((route, idx) => (
                <button
                  key={route.id}
                  onClick={() => setSelectedRouteIndex(idx)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border:
                      selectedRouteIndex === idx
                        ? '2px solid #16a34a'
                        : '1px solid #e5e7eb',
                    backgroundColor:
                      selectedRouteIndex === idx ? '#f8fafc' : 'white',
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      color: '#111827',
                      marginBottom: 8,
                    }}
                  >
                    {idx === 0 ? '최적 추천 · ' : ''}
                    {route.name}
                  </div>

                  <div
                    style={{
                      color: '#4b5563',
                      fontSize: 14,
                      marginBottom: 8,
                    }}
                  >
                    {route.distance} · {route.duration}
                  </div>

                  <div
                    style={{
                      color: getSafetyColor(Number(route.safetyScore || 0)),
                      fontWeight: 900,
                      fontSize: 14,
                    }}
                  >
                    안전 점수 {route.safetyScore} / 5 · 주변 리뷰{' '}
                    {route.nearReviews.length}개
                  </div>
                </button>
              ))}
            </>
          ) : !selectedPlace ? (
            <div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
                  color: '#14532d',
                  lineHeight: 1.1,
                }}
              >
                여기지!
              </div>
              <div
                style={{
                  marginTop: 5,
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#6b7280',
                }}
              >
                Safety Map
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: '#9ca3af',
                  lineHeight: 1.4,
                }}
              >
                내 주변 장소를 눌러 안전 점수와 리뷰를 확인해보세요
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 21,
                      fontWeight: 900,
                      color: '#111827',
                      marginBottom: 5,
                    }}
                  >
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        backgroundColor: '#dcfce7',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 auto',
                        overflow: 'hidden',
                      }}
                    >
                      {selectedPlace.icon ? (
                        <>
                          <img
                            src={selectedPlace.icon}
                            alt=""
                            onError={handlePlaceIconError}
                            style={{
                              width: 18,
                              height: 18,
                            }}
                          />
                          <span style={{ display: 'none' }}>📍</span>
                        </>
                      ) : (
                        '📍'
                      )}
                    </span>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {selectedPlace.name}
                    </span>
                  </div>

                  {selectedPlace.address && (
                    <div
                      style={{
                        fontSize: 13,
                        color: '#6b7280',
                      }}
                    >
                      {selectedPlace.address}
                    </div>
                  )}
                </div>

                <button
                  onClick={resetPlaceAndRoute}
                  style={{
                    border: 'none',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    borderRadius: 999,
                    padding: '8px 11px',
                    fontWeight: 800,
                    flex: '0 0 auto',
                  }}
                >
                  닫기
                </button>
              </div>

              <div style={placeActionRowStyle}>
                <button
                  onClick={() => setPointAsStart(selectedPlace)}
                  style={placeActionStyle('#dbeafe', '#1d4ed8')}
                >
                  출발
                </button>

                <button
                  onClick={() => setPointAsEnd(selectedPlace)}
                  style={placeActionStyle('#fee2e2', '#dc2626')}
                >
                  도착
                </button>
              </div>

              {startPoint && (
                <div style={{ marginBottom: 12 }}>{renderLocationBox()}</div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <div style={scoreBoxStyle}>
                  <div style={scoreLabelStyle}>평균 평점</div>
                  <div style={scoreValueStyle}>
                    ⭐ {getUserAverage(reviews)}
                  </div>
                </div>

                <div style={scoreBoxStyle}>
                  <div style={scoreLabelStyle}>안전 점수</div>
                  <div
                    style={{
                      ...scoreValueStyle,
                      color: getSafetyColor(Number(getDisplayedSafetyScore())),
                    }}
                  >
                    {getDisplayedSafetyScore()} / 5
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderTop: '1px solid #eeeeee',
                  paddingTop: 12,
                  fontWeight: 900,
                  color: '#111827',
                  marginBottom: 8,
                }}
              >
                리뷰
              </div>

              {reviews.length === 0 && (
                <div
                  style={{
                    color: '#6b7280',
                    backgroundColor: '#f9fafb',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                    fontSize: 12,
                  }}
                >
                  아직 리뷰가 없어요.
                </div>
              )}

              {reviews.map((review, idx) => (
                <div
                  key={`${review.lat}-${review.lng}-${idx}`}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ color: '#f59e0b', marginBottom: 5 }}>
                    {'★'.repeat(review.user_score)}
                    {'☆'.repeat(5 - review.user_score)}
                  </div>
                  <div style={{ color: '#374151', fontSize: 14 }}>
                    {review.content}
                  </div>
                </div>
              ))}

              <div
                style={{
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: 12,
                  marginTop: 12,
                }}
              >
                <div style={{ marginBottom: 8 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      onClick={() => setReviewRating(star)}
                      style={{
                        cursor: 'pointer',
                        color: star <= reviewRating ? '#f59e0b' : '#d1d5db',
                        fontSize: 24,
                        marginRight: 2,
                      }}
                    >
                      ★
                    </span>
                  ))}
                </div>

                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="리뷰 입력"
                  style={{
                    width: '100%',
                    minHeight: 78,
                    boxSizing: 'border-box',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 12,
                    resize: 'none',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />

                <button
                  onClick={saveReview}
                  style={{
                    width: '100%',
                    height: 44,
                    marginTop: 8,
                    border: 'none',
                    borderRadius: 12,
                    backgroundColor: '#14532d',
                    color: 'white',
                    fontWeight: 900,
                  }}
                >
                  리뷰 저장
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const locationBoxStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: '12px 12px',
  background: '#f8fafc',
};

const locationLineStyle = {
  display: 'grid',
  gridTemplateColumns: '12px 38px 1fr',
  alignItems: 'center',
  gap: 8,
  minHeight: 30,
};

const startDotStyle = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: '#2563eb',
  boxShadow: '0 0 6px rgba(37, 99, 235, 0.55)',
};

const endDotStyle = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: '#ef4444',
  boxShadow: '0 0 6px rgba(239, 68, 68, 0.5)',
};

const locationLabelStyle = {
  fontSize: 12,
  color: '#64748b',
  fontWeight: 700,
};

const locationTextStyle = {
  fontSize: 14,
  color: '#111827',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
};

const locationDividerStyle = {
  marginLeft: 5,
  height: 14,
  borderLeft: '2px dotted #cbd5e1',
};

const placeActionRowStyle = {
  display: 'grid',
  gridTemplateColumns: '58px 58px',
  gap: 6,
  marginBottom: 10,
  justifyContent: 'start',
};

const placeActionStyle = (backgroundColor, color) => ({
  height: 32,
  border: 'none',
  borderRadius: 9,
  backgroundColor,
  color,
  fontWeight: 900,
  fontSize: 13,
});

const noticeStyle = {
  margin: '8px 0 12px',
  color: '#14532d',
  fontWeight: 800,
  fontSize: 14,
};

const scoreBoxStyle = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 12,
};

const scoreLabelStyle = {
  color: '#6b7280',
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 5,
};

const scoreValueStyle = {
  color: '#111827',
  fontSize: 18,
  fontWeight: 900,
};

const targetLineTopStyle = {
  position: 'absolute',
  left: '50%',
  top: -5,
  width: 2,
  height: 6,
  backgroundColor: '#4b5563',
  transform: 'translateX(-50%)',
  borderRadius: 999,
};

const targetLineBottomStyle = {
  position: 'absolute',
  left: '50%',
  bottom: -5,
  width: 2,
  height: 6,
  backgroundColor: '#4b5563',
  transform: 'translateX(-50%)',
  borderRadius: 999,
};

const targetLineLeftStyle = {
  position: 'absolute',
  left: -5,
  top: '50%',
  width: 6,
  height: 2,
  backgroundColor: '#4b5563',
  transform: 'translateY(-50%)',
  borderRadius: 999,
};

const targetLineRightStyle = {
  position: 'absolute',
  right: -5,
  top: '50%',
  width: 6,
  height: 2,
  backgroundColor: '#4b5563',
  transform: 'translateY(-50%)',
  borderRadius: 999,
};

const targetDotStyle = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 4,
  height: 4,
  borderRadius: 999,
  backgroundColor: '#4b5563',
  transform: 'translate(-50%, -50%)',
};

export default App;
