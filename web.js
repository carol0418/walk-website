// web.js (已整合最高分標紅功能)

let map;
let allPathsData = []; // 儲存所有路徑的數據
let currentPathIndex = -1; // 當前正在繪製的路徑的索引
const MAX_PATH_LENGTH_KM = 1.5; // 最大路徑長度 (公里)

const BACKEND_API_KEY_ENDPOINT = 'https://your-flask-app-cpr3fyor5q-de.a.run.app/get_maps_api_key';
let Maps_API_KEY_FROM_BACKEND = '';

// DOM 元素引用
let pathNameInputCard;
let newPathNameInput;
let confirmPathNameButton;
let cancelPathNameButton;
let messageContainer;
let undoLastPointButton;
let mapControlsPanel;

// 彈出視窗 DOM 元素引用
let imagePreviewModal;
let modalPathName;
let modalImageContainer;
let modalCloseButton;

// 載入 Google Maps 腳本
function loadGoogleMapsScript() {
    const script = document.getElementById('google-maps-script');
    if (!script) {
        console.error("找不到 ID 為 'google-maps-script' 的腳本標籤。");
        return;
    }

    script.src = `https://maps.googleapis.com/maps/api/js?key=${Maps_API_KEY_FROM_BACKEND}&libraries=geometry,places&callback=initMap`;
    document.head.appendChild(script);
}

// 頁面載入後獲取 API 金鑰
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch(BACKEND_API_KEY_ENDPOINT);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        Maps_API_KEY_FROM_BACKEND = data.apiKey;

        if (Maps_API_KEY_FROM_BACKEND) {
            loadGoogleMapsScript(); // 成功獲取金鑰後載入 Google Maps 腳本
        } else {
            console.error("從後端獲取到空的 Google Maps API 金鑰。");
            showTemporaryMessage("無法載入地圖:API 金鑰缺失。", 'error', 5000);
        }
    } catch (error) {
        console.error('獲取 Google Maps API 金鑰時發生錯誤:', error);
        showTemporaryMessage("無法載入地圖：後端連線失敗或 API 金鑰獲取錯誤。", 'error', 5000);
    }
});

// 顯示臨時訊息
function showTemporaryMessage(message, type = 'info', duration = 3000) {
    if (!messageContainer) {
        console.error("Message container not found.");
        return;
    }

    const toast = document.createElement('div');
    toast.textContent = message;
    toast.classList.add(`${type}-toast`);
    
    messageContainer.prepend(toast);

    void toast.offsetWidth;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, { once: true });
    }, duration);
}

// 初始化地圖
function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error("找不到 ID 為 'map' 的地圖容器元素。請確保您的 HTML 中有 <div id='map'></div>");
        return;
    }

    map = new google.maps.Map(mapElement, {
        center: {lat: 23.7, lng: 121.0},
        zoom: 7.5,
        mapTypeControl: false,
        streetViewControl: false
    });
    
    map.addListener('click', function(event) {
        addLatLng(event.latLng);
    });

    const searchInputContainer = document.createElement('div');
    searchInputContainer.classList.add('search-input-container');
    
    const searchInput = document.createElement('input');
    searchInput.id = 'pac-input';
    searchInput.classList.add('map-search-input');
    searchInput.type = 'text';
    searchInput.placeholder = '搜尋地點...';
    searchInputContainer.appendChild(searchInput);

    const clearButton = document.createElement('button');
    clearButton.classList.add('clear-search-button');
    clearButton.innerHTML = '&times;';
    clearButton.title = '清除搜尋';
    searchInputContainer.appendChild(clearButton);

    map.controls[google.maps.ControlPosition.TOP_LEFT].push(searchInputContainer);

    searchInput.addEventListener('input', function() {
        if (this.value.length > 0) {
            clearButton.style.display = 'block';
        } else {
            clearButton.style.display = 'none';
        }
    });

    clearButton.addEventListener('click', function() {
        searchInput.value = '';
        clearButton.style.display = 'none';
    });

    const autocomplete = new google.maps.places.Autocomplete(searchInput);
    autocomplete.bindTo('bounds', map);
    autocomplete.setFields(['geometry', 'name']);

    const marker = new google.maps.Marker({
        map,
        anchorPoint: new google.maps.Point(0, -29),
    });
    marker.setVisible(false);

    autocomplete.addListener('place_changed', () => {
        marker.setVisible(false);
        const place = autocomplete.getPlace();

        if (!place.geometry || !place.geometry.location) {
            showTemporaryMessage(`找不到地點: "${place.name}"`, 'error');
            return;
        }

        if (place.geometry.viewport) {
            map.fitBounds(place.geometry.viewport);
        } else {
            map.setCenter(place.geometry.location);
            map.setZoom(17);
        }

        marker.setPosition(place.geometry.location);
        marker.setVisible(true);
    });

    mapControlsPanel = document.getElementById('map-controls-panel');
    if (!mapControlsPanel) {
        mapControlsPanel = document.createElement('div');
        mapControlsPanel.id = 'map-controls-panel';
        map.controls[google.maps.ControlPosition.TOP_RIGHT].push(mapControlsPanel);
    }

    const newPathButton = document.createElement('button');
    newPathButton.textContent = '開始新路徑';
    newPathButton.classList.add('map-control-button');
    mapControlsPanel.appendChild(newPathButton);
    newPathButton.addEventListener('click', () => {
        pathNameInputCard.style.display = 'block';
        newPathNameInput.value = `路徑 ${allPathsData.length + 1}`;
        newPathNameInput.focus();
        const resultsDisplay = document.getElementById('results-display');
        const existingPrompt = resultsDisplay.querySelector('p');
        if (existingPrompt && existingPrompt.textContent.includes('點擊「開始新路徑」按鈕以繪製您的第一條路徑。')) {
            resultsDisplay.innerHTML = '';
            resultsDisplay.appendChild(pathNameInputCard);
        }
    });

    undoLastPointButton = document.createElement('button');
    undoLastPointButton.textContent = '撤銷上一個點';
    undoLastPointButton.classList.add('map-control-button');
    mapControlsPanel.appendChild(undoLastPointButton);
    undoLastPointButton.addEventListener('click', undoLastPoint);

    const calculateButton = document.createElement('button');
    calculateButton.textContent = '計算路徑分數';
    calculateButton.classList.add('map-control-button');
    mapControlsPanel.appendChild(calculateButton);
    calculateButton.addEventListener('click', sendImagesToBackendForAllPaths);

    const clearAllButton = document.createElement('button');
    clearAllButton.textContent = '清除所有路徑';
    clearAllButton.classList.add('map-control-button');
    mapControlsPanel.appendChild(clearAllButton);
    clearAllButton.addEventListener('click', clearAllPaths);

    pathNameInputCard = document.getElementById('path-name-input-card');
    newPathNameInput = document.getElementById('new-path-name');
    confirmPathNameButton = document.getElementById('confirm-path-name');
    cancelPathNameButton = document.getElementById('cancel-path-name');
    messageContainer = document.getElementById('message-container');

    confirmPathNameButton.addEventListener('click', handleConfirmPathName);
    cancelPathNameButton.addEventListener('click', handleCancelPathName);
    
    const resultsDisplay = document.getElementById('results-display');
    resultsDisplay.innerHTML = '';
    resultsDisplay.appendChild(pathNameInputCard);
    const initialPrompt = document.createElement('p');
    initialPrompt.textContent = '點擊「開始新路徑」按鈕以繪製您的第一條路徑。';
    resultsDisplay.appendChild(initialPrompt);

    imagePreviewModal = document.getElementById('image-preview-modal');
    modalPathName = document.getElementById('modal-path-name');
    modalImageContainer = document.getElementById('modal-image-container');
    modalCloseButton = document.getElementById('modal-close-button');

    modalCloseButton.addEventListener('click', closeImagePreviewModal);
    imagePreviewModal.addEventListener('click', (e) => {
        if (e.target.id === 'image-preview-modal') {
            closeImagePreviewModal();
        }
    });

    console.log("Google 地圖已初始化並準備好接收點擊事件。");
}

function handleConfirmPathName() {
    let pathName = newPathNameInput.value.trim();
    if (pathName === "") {
        pathName = `路徑 ${allPathsData.length + 1}`;
    }

    pathNameInputCard.style.display = 'none';
    newPathNameInput.value = '';

    currentPathIndex = allPathsData.length;
    const newColor = '#' + Math.floor(Math.random()*16777215).toString(16);

    const newPolyline = new google.maps.Polyline({
        path: [],
        geodesic: true,
        strokeColor: newColor,
        strokeOpacity: 1.0,
        strokeWeight: 4
    });
    newPolyline.setMap(map);

    allPathsData.push({
        id: currentPathIndex,
        name: pathName,
        coordinates: [],
        polyline: newPolyline,
        scores: {},
        isLoading: false,
        length: 0
    });

    console.log(`已開始新路徑 (ID: ${currentPathIndex}, 名稱: ${pathName})，請在地圖上點選以添加點。`);
    showTemporaryMessage(`已創建新路徑: ${pathName}`, 'success');
    displayResultsOnWebsite();
}

function handleCancelPathName() {
    pathNameInputCard.style.display = 'none';
    newPathNameInput.value = '';
    console.log("取消創建新路徑。");
    showTemporaryMessage("已取消創建新路徑。", 'info');
    if (allPathsData.length === 0) {
        const resultsDisplay = document.getElementById('results-display');
        resultsDisplay.innerHTML = '';
        resultsDisplay.appendChild(pathNameInputCard);
        const initialPrompt = document.createElement('p');
        initialPrompt.textContent = '點擊「開始新路徑」按鈕以繪製您的第一條路徑。';
        resultsDisplay.appendChild(initialPrompt);
    }
}

function addLatLng(latLng) {
    if (pathNameInputCard.style.display === 'block') {
        showTemporaryMessage("請先確認或取消路徑名稱輸入！", 'info');
        return;
    }

    if (currentPathIndex === -1) {
        console.warn("未選擇任何路徑。請先點擊 '開始新路徑'。");
        showTemporaryMessage("請先點擊 '開始新路徑' 按鈕來開始繪製路徑！", 'info');
        return;
    }

    const currentPath = allPathsData[currentPathIndex];
    
    const potentialCoordinates = [...currentPath.coordinates, latLng];
    const potentialLengthMeters = google.maps.geometry.spherical.computeLength(potentialCoordinates);
    const potentialLengthKm = potentialLengthMeters / 1000;

    if (potentialLengthKm > MAX_PATH_LENGTH_KM) {
        showTemporaryMessage(`路徑長度不能超過 ${MAX_PATH_LENGTH_KM} 公里！當前路徑長度約 ${currentPath.length.toFixed(2)} 公里。`, 'error', 5000);
        return;
    }

    currentPath.coordinates.push(latLng);
    currentPath.polyline.setPath(currentPath.coordinates);
    currentPath.length = potentialLengthKm;

    console.log(`路徑 ID ${currentPathIndex} (${currentPath.name}) 添加點: Lat ${latLng.lat().toFixed(6)}, Lng ${latLng.lng().toFixed(6)}。當前路徑點數: ${currentPath.coordinates.length}, 長度: ${currentPath.length.toFixed(2)} 公里。`);
    displayResultsOnWebsite();
}

function undoLastPoint() {
    if (currentPathIndex === -1 || allPathsData[currentPathIndex].coordinates.length === 0) {
        showTemporaryMessage("當前路徑沒有點可以撤銷。", 'info');
        return;
    }

    const currentPath = allPathsData[currentPathIndex];
    currentPath.coordinates.pop(); 
    currentPath.polyline.setPath(currentPath.coordinates);

    if (currentPath.coordinates.length > 0) {
        const newLengthMeters = google.maps.geometry.spherical.computeLength(currentPath.coordinates);
        currentPath.length = newLengthMeters / 1000;
    } else {
        currentPath.length = 0;
    }

    console.log(`已撤銷路徑 ID ${currentPathIndex} (${currentPath.name}) 的最後一個點。剩餘點數: ${currentPath.coordinates.length}, 長度: ${currentPath.length.toFixed(2)} 公里。`);
    showTemporaryMessage("已撤銷上一個點。", 'info');
    displayResultsOnWebsite();
}

function deletePath(pathIdToDelete) {
    if (pathIdToDelete < 0 || pathIdToDelete >= allPathsData.length) {
        console.warn(`嘗試刪除不存在的路徑 ID: ${pathIdToDelete}`);
        showTemporaryMessage("嘗試刪除不存在的路徑。", 'error');
        return;
    }

    const pathToDelete = allPathsData[pathIdToDelete];
    pathToDelete.polyline.setMap(null);

    allPathsData.splice(pathIdToDelete, 1);

    allPathsData.forEach((path, index) => {
        path.id = index;
    });

    if (currentPathIndex === pathIdToDelete) {
        currentPathIndex = -1;
    } else if (currentPathIndex > pathIdToDelete) {
        currentPathIndex--;
    }

    console.log(`已刪除路徑 ID ${pathIdToDelete} (${pathToDelete.name})。`);
    showTemporaryMessage(`已刪除路徑: ${pathToDelete.name}`, 'success');
    displayResultsOnWebsite();
}

function clearAllPaths() {
    allPathsData.forEach(path => {
        path.polyline.setMap(null);
    });
    allPathsData = [];
    currentPathIndex = -1;
    
    const resultsDisplay = document.getElementById('results-display');
    resultsDisplay.innerHTML = '';
    resultsDisplay.appendChild(pathNameInputCard);
    const initialPrompt = document.createElement('p');
    initialPrompt.textContent = '所有路徑已清除。點擊「開始新路徑」按鈕以繪製新的路徑。';
    resultsDisplay.appendChild(initialPrompt);

    pathNameInputCard.style.display = 'none';
    newPathNameInput.value = '';
    console.log("所有路徑已清除。");
    showTemporaryMessage("所有路徑已清除！", 'success');
}

function createStreetViewUrl(latLng, heading, size, fov, pitch, angleOffset) {
    const location = `${latLng.lat()},${latLng.lng()}`;
    const finalHeading = (heading + angleOffset + 360) % 360; 
    return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${location}&fov=${fov}&heading=${finalHeading}&pitch=${pitch}&key=${Maps_API_KEY_FROM_BACKEND}`;
}

function getPointAtDistance(path, distance) {
    if (distance < 0) return null;

    let cumulativeDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i+1];
        const segmentLength = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);

        if (cumulativeDistance + segmentLength >= distance) {
            const fraction = (distance - cumulativeDistance) / segmentLength;
            return google.maps.geometry.spherical.interpolate(p1, p2, fraction);
        }
        cumulativeDistance += segmentLength;
    }
    return null;
}

function generateStreetViewImageUrls(pathCoordinatesArray) {
    if (pathCoordinatesArray.length === 0) {
        console.warn("路徑中沒有點，無法生成街景圖片 URL。");
        return [];
    }

    const imageUrls = [];
    const size = "600x400";
    const fov = "90"; 
    const pitch = "-5";
    const angleOffset = 45; 
    const interval = 100;

    const totalPathLength = google.maps.geometry.spherical.computeLength(pathCoordinatesArray);

    let startPointHeading = 0;
    if (pathCoordinatesArray.length > 1) {
        startPointHeading = google.maps.geometry.spherical.computeHeading(pathCoordinatesArray[0], pathCoordinatesArray[1]);
    }
    imageUrls.push(createStreetViewUrl(pathCoordinatesArray[0], startPointHeading, size, fov, pitch, angleOffset));

    for (let currentDistance = interval; currentDistance < totalPathLength; currentDistance += interval) {
        const interpolatedPoint = getPointAtDistance(pathCoordinatesArray, currentDistance);

        if (interpolatedPoint) {
            let pointHeading = 0;
            let segmentStartIndex = -1;
            let cumulativeSegmentDistance = 0;

            for (let i = 0; i < pathCoordinatesArray.length - 1; i++) {
                const p1 = pathCoordinatesArray[i];
                const p2 = pathCoordinatesArray[i+1];
                const segmentLength = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);

                if (cumulativeSegmentDistance + segmentLength >= currentDistance) {
                    segmentStartIndex = i;
                    break;
                }
                cumulativeSegmentDistance += segmentLength;
            }

            if (segmentStartIndex !== -1 && segmentStartIndex < pathCoordinatesArray.length - 1) {
                pointHeading = google.maps.geometry.spherical.computeHeading(pathCoordinatesArray[segmentStartIndex], pathCoordinatesArray[segmentStartIndex + 1]);
            } else if (pathCoordinatesArray.length > 1) {
                pointHeading = google.maps.geometry.spherical.computeHeading(pathCoordinatesArray[pathCoordinatesArray.length - 2], pathCoordinatesArray[pathCoordinatesArray.length - 1]);
            }
            imageUrls.push(createStreetViewUrl(interpolatedPoint, pointHeading, size, fov, pitch, angleOffset));
        }
    }

    const lastPoint = pathCoordinatesArray[pathCoordinatesArray.length - 1];
    let endPointHeading = 0;
    if (pathCoordinatesArray.length > 1) {
        endPointHeading = google.maps.geometry.spherical.computeHeading(pathCoordinatesArray[pathCoordinatesArray.length - 2], lastPoint);
    }

    const lastAddedUrl = imageUrls[imageUrls.length - 1];
    let lastAddedLatLng = null;
    if (lastAddedUrl) {
        const locationMatch = lastAddedUrl.match(/location=([\d\.-]+),([\d\.-]+)/);
        if (locationMatch) {
            lastAddedLatLng = new google.maps.LatLng(parseFloat(locationMatch[1]), parseFloat(locationMatch[2]));
        }
    }
    
    if (pathCoordinatesArray.length > 1 && (!lastAddedLatLng || google.maps.geometry.spherical.computeDistanceBetween(lastAddedLatLng, lastPoint) > 1)) {
        imageUrls.push(createStreetViewUrl(lastPoint, endPointHeading, size, fov, pitch, angleOffset));
    }

    console.log("生成的街景圖片 URLs:", imageUrls);
    return imageUrls;
}

const BACKEND_API_ENDPOINT = 'https://your-flask-app-cpr3fyor5q-de.a.run.app/predict_street_scores'
async function sendImagesToBackendForAllPaths() {
    if (allPathsData.length === 0) {
        showTemporaryMessage("地圖上沒有任何路徑。請先繪製路徑！", 'info');
        return;
    }

    const resultsDiv = document.getElementById('results-display');
    const inputCard = document.getElementById('path-name-input-card');
    if (inputCard && inputCard.parentNode === resultsDiv) {
        resultsDiv.removeChild(inputCard);
    }

    resultsDiv.innerHTML = '';
    resultsDiv.appendChild(inputCard);
    const calculatingPrompt = document.createElement('p');
    calculatingPrompt.textContent = '正在發送圖片並計算所有路徑的分數，請稍候...';
    resultsDiv.appendChild(calculatingPrompt);
    
    pathNameInputCard.style.display = 'none';

    for (const path of allPathsData) {
        if (path.scores && Object.keys(path.scores).length > 0 && !path.scores.error && path.scores.safe !== 'N/A') {
            console.log(`路徑 ID ${path.id} (${path.name}) 已經有分數，跳過重新計算。`);
            displayResultsOnWebsite();
            continue;
        }

        if (path.coordinates.length === 0) {
            console.warn(`路徑 ID ${path.id} (${path.name}) 沒有點，跳過計算。`);
            path.scores = { safe: 'N/A', lively: 'N/A', clean: 'N/A', error: "路徑無點" };
            continue;
        }

        path.isLoading = true;
        displayResultsOnWebsite();

        const imageUrls = generateStreetViewImageUrls(path.coordinates);
        if (imageUrls.length === 0) {
            path.scores = { safe: 'N/A', lively: 'N/A', clean: 'N/A', error: "無法生成圖片URL" };
            path.isLoading = false;
            displayResultsOnWebsite();
            continue;
        }

        try {
            const response = await fetch(BACKEND_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ images: imageUrls })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log(`後端返回的路徑 ${path.name} 評分結果:`, data);

            let totalSafe = 0, totalLively = 0, totalClean = 0;
            let validCount = 0;

            data.forEach(prediction => {
                if (prediction.predicted_score_safe !== null && typeof prediction.predicted_score_safe === 'number') {
                    totalSafe += prediction.predicted_score_safe;
                    totalLively += prediction.predicted_score_lively;
                    totalClean += prediction.predicted_score_clean;
                    validCount++;
                }
            });

            if (validCount > 0) {
                path.scores = {
                    safe: (totalSafe / validCount).toFixed(2),
                    lively: (totalLively / validCount).toFixed(2),
                    clean: (totalClean / validCount).toFixed(2),
                };
            } else {
                path.scores = { safe: 'N/A', lively: 'N/A', clean: 'N/A', error: "無有效分數" };
            }

        } catch (error) {
            console.error(`發送路徑 ${path.name} 資料到後端或處理響應時發生錯誤:`, error);
            path.scores = { safe: 'Error', lively: 'Error', clean: 'Error', error: error.message };
        } finally {
            path.isLoading = false;
            displayResultsOnWebsite();
        }
    }
    showTemporaryMessage("所有路徑分數計算完成！", 'success');
}

function openImagePreviewModal(pathId) {
    const path = allPathsData.find(p => p.id === pathId);
    if (!path || path.coordinates.length === 0) {
        showTemporaryMessage('此路徑沒有點，無法預覽圖片。', 'info');
        return;
    }

    modalImageContainer.innerHTML = '';

    const imageUrls = generateStreetViewImageUrls(path.coordinates);
    
    if (imageUrls.length === 0) {
        const noImageText = document.createElement('p');
        noImageText.textContent = '此路徑無法生成任何街景預覽圖片。';
        modalImageContainer.appendChild(noImageText);
    } else {
        imageUrls.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.alt = `路徑 ${path.name} 的街景圖`;
            modalImageContainer.appendChild(img);
        });
    }

    modalPathName.textContent = `預覽路徑: ${path.name} (${imageUrls.length} 張圖片)`;
    imagePreviewModal.style.display = 'flex';
}

function closeImagePreviewModal() {
    imagePreviewModal.style.display = 'none';
    modalImageContainer.innerHTML = '';
}

// web.js

function displayResultsOnWebsite() {
    const resultsDiv = document.getElementById('results-display');
    const inputCard = document.getElementById('path-name-input-card');
    if (inputCard && inputCard.parentNode === resultsDiv) {
        resultsDiv.removeChild(inputCard);
    }
    
    resultsDiv.innerHTML = '';
    resultsDiv.appendChild(inputCard);

    if (allPathsData.length === 0 && inputCard.style.display !== 'block') {
        const initialPrompt = document.createElement('p');
        initialPrompt.textContent = '點擊「開始新路徑」按鈕以繪製您的第一條路徑。';
        resultsDiv.appendChild(initialPrompt);
        return;
    }

    allPathsData.forEach(path => {
        const resultItem = document.createElement('div');
        resultItem.classList.add('result-item');
        resultItem.style.borderLeft = `5px solid ${path.polyline.get('strokeColor')}`;

        // --- 【這就是修改的部分】 ---
        // 1. 建立新的 header 容器
        const pathHeader = document.createElement('div');
        pathHeader.classList.add('path-header');

        // 2. 建立標題 (h3) 並放入 header 容器
        const pathTitle = document.createElement('h3');
        pathTitle.textContent = path.name;
        pathHeader.appendChild(pathTitle);

        // 3. 建立公里數 (p) 並放入 header 容器
        const pathLengthP = document.createElement('p');
        pathLengthP.classList.add('path-length');
        pathLengthP.textContent = `${path.length.toFixed(2)} 公里`;
        pathHeader.appendChild(pathLengthP);

        // 4. 最後將整個 header 容器放入 resultItem
        resultItem.appendChild(pathHeader);
        // --- 【修改結束】 ---

        const divider = document.createElement('div');
        divider.classList.add('path-divider');
        resultItem.appendChild(divider);

        // (原本的 pathLengthP 和 pathTitle 已經在上面處理掉了)

        const deleteButton = document.createElement('button');
        deleteButton.classList.add('delete-path-button');
        deleteButton.innerHTML = '&times;';
        deleteButton.title = `刪除路徑: ${path.name}`;
        deleteButton.onclick = () => deletePath(path.id);
        resultItem.appendChild(deleteButton);

        if (path.isLoading) {
            const loadingContainer = document.createElement('div');
            loadingContainer.classList.add('loading-animation-container');
            loadingContainer.innerHTML = `
                <div id="ballsWaveG">
                    <div id="ballsWaveG_1" class="ballsWaveG"></div>
                    <div id="ballsWaveG_2" class="ballsWaveG"></div>
                    <div id="ballsWaveG_3" class="ballsWaveG"></div>
                    <div id="ballsWaveG_4" class="ballsWaveG"></div>
                    <div id="ballsWaveG_5" class="ballsWaveG"></div>
                    <div id="ballsWaveG_6" class="ballsWaveG"></div>
                    <div id="ballsWaveG_7" class="ballsWaveG"></div>
                    <div id="ballsWaveG_8" class="ballsWaveG"></div>
                </div>
            `;
            resultItem.appendChild(loadingContainer);
        } 
          else if (path.scores.error) {
            const errorP = document.createElement('p');
            errorP.textContent = `計算錯誤: ${path.scores.error}`;
            errorP.classList.add('error-text');
            resultItem.appendChild(errorP);
        } 
          else if (Object.keys(path.scores).length > 0) {
            const scoreDiv = document.createElement('div');
            scoreDiv.classList.add('scores');

            const studyTypes = ['safe', 'lively', 'clean'];

            const scoresArr = studyTypes.map(type => parseFloat(path.scores[type])).filter(score => !isNaN(score));
            const maxScore = scoresArr.length > 0 ? Math.max(...scoresArr) : -Infinity;

            studyTypes.forEach(type => {
                const scoreItem = document.createElement('div');
                scoreItem.classList.add('score-item');

                const labelSpan = document.createElement('span');
                labelSpan.classList.add('score-label');
                labelSpan.textContent = type;
                scoreItem.appendChild(labelSpan);

                const score = path.scores[type] !== undefined ? path.scores[type] : 'N/A';
                
                if (score !== 'N/A' && !isNaN(parseFloat(score))) {
                    const [integerPart, decimalPart] = parseFloat(score).toFixed(2).split('.');
                    
                    const scoreValueSpan = document.createElement('span');
                    
                    const integerSpan = document.createElement('span');
                    integerSpan.classList.add('score-integer');
                    integerSpan.textContent = integerPart;
                    scoreValueSpan.appendChild(integerSpan);

                    const decimalSpan = document.createElement('span');
                    decimalSpan.classList.add('score-decimal');
                    decimalSpan.textContent = `.${decimalPart}`;
                    scoreValueSpan.appendChild(decimalSpan);
                    
                    scoreItem.appendChild(scoreValueSpan);

                    const isMax = parseFloat(score) === maxScore;
             
                    if (isMax) {
                        scoreItem.classList.add('highest-score');
                    }
                } else {
                    const p = document.createElement('p');
                    p.textContent = score;
                    scoreItem.appendChild(p);
                }
                scoreDiv.appendChild(scoreItem);
            });
            resultItem.appendChild(scoreDiv);
        }

        const previewButton = document.createElement('button');
        previewButton.textContent = '預覽圖片';
        previewButton.classList.add('preview-images-button');
        previewButton.onclick = () => openImagePreviewModal(path.id); 
        resultItem.appendChild(previewButton);

        resultsDiv.appendChild(resultItem);
    });
}
