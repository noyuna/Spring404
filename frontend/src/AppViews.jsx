import React from 'react';
import { GoogleMap, Marker, OverlayView } from '@react-google-maps/api';

import {
  center,
  mapStyle,
  getMyLocationIcon,
  getPinIcon,
  getSafetyColor,
  getUserAverage,
  handlePlaceIconError,
} from './mapHelpers';

import {
  locationBoxStyle,
  locationLineStyle,
  startDotStyle,
  endDotStyle,
  locationLabelStyle,
  locationTextStyle,
  locationDividerStyle,
  placeActionRowStyle,
  placeActionStyle,
  noticeStyle,
  scoreBoxStyle,
  scoreLabelStyle,
  scoreValueStyle,
  targetLineTopStyle,
  targetLineBottomStyle,
  targetLineLeftStyle,
  targetLineRightStyle,
  targetDotStyle,
} from './styles';

export function SearchPanel({
  searchText,
  setSearchText,
  setSearchScreenOpen,
  searchPlaces,
  searchScreenOpen,
  closeSearch,
  searchLoading,
  searchError,
  searchResults,
  openPlaceDetail,
}) {
  return (
    <>
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
                      style={{ width: 18, height: 18 }}
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
    </>
  );
}

export function MapView({
  setMap,
  handleReviewPlaceSelect,
  myLocation,
  selectedPlace,
  isRouteView,
  openPlaceDetail,
  startPoint,
  endPoint,
}) {
  return (
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
              getPixelPositionOffset={() => ({ x: -22, y: -22 })}
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
              getPixelPositionOffset={() => ({ x: -22, y: -48 })}
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
                        style={{ width: 17, height: 17 }}
                      />
                      <span style={{ display: 'none', fontSize: 14 }}>📍</span>
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
              getPixelPositionOffset={() => ({ x: 0, y: 18 })}
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
  );
}

export function MyLocationButton({ moveToMyLocation, locationLoading, sheetHeight }) {
  return (
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
  );
}

function LocationBox({ startPoint, endPoint }) {
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
}

export function BottomSheet({
  sheetHeight,
  startDrag,
  isRouteView,
  closeRouteView,
  startPoint,
  endPoint,
  routeLoading,
  routeError,
  routeCandidates,
  selectedRouteIndex,
  setSelectedRouteIndex,
  selectedPlace,
  resetPlaceAndRoute,
  setPointAsStart,
  setPointAsEnd,
  reviews,
  displayedSafetyScore,
  reviewRating,
  setReviewRating,
  reviewText,
  setReviewText,
  saveReview,
}) {
  return (
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

          <div style={{ marginBottom: 18 }}>
            <LocationBox startPoint={startPoint} endPoint={endPoint} />
          </div>

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
        <div style={{ textAlign: 'center' }}>
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
                        style={{ width: 18, height: 18 }}
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
                <div style={{ fontSize: 13, color: '#6b7280' }}>
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
            <div style={{ marginBottom: 12 }}>
              <LocationBox startPoint={startPoint} endPoint={endPoint} />
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div style={{ ...scoreBoxStyle, textAlign: 'center' }}>
              <div style={scoreLabelStyle}>평균 평점</div>
              <div style={scoreValueStyle}>⭐ {getUserAverage(reviews)}</div>
            </div>

            <div style={{ ...scoreBoxStyle, textAlign: 'center' }}>
              <div style={scoreLabelStyle}>안전 점수</div>
              <div
                style={{
                  ...scoreValueStyle,
                  color: getSafetyColor(Number(displayedSafetyScore)),
                }}
              >
                {displayedSafetyScore} / 5
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
              textAlign: 'center',
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
                textAlign: 'center',
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
            <div style={{ marginBottom: 8, textAlign: 'center' }}>
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
                textAlign: 'center',
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
  );
}
