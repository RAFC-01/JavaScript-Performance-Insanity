let stats = new Stats();
stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom, -1 disable
document.body.appendChild( stats.dom );
const { createNoise2D } = require('simplex-noise');

let seed = Math.floor(Math.random() * 1000000000000);
if (Math.random() > 0.5) seed *= -1;

seed = "test";

function smoothstep(edge0, edge1, x) {
    // Scale, bias, and saturate x to 0..1 range
    x = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    // Evaluate polynomial
    return x * x * (3 - 2 * x);
}

const noise2D = createNoise2D(() => seed);

let mapGenerator = {
    lastHeightValue: null,
}



const g_canvas = document.querySelector('canvas');
const g_ctx = g_canvas.getContext('2d');

const lightCanvas = document.createElement('canvas');
// lightCanvas.style.position = 'fixed';
// lightCanvas.style.top = '0px';
// lightCanvas.style.left = '0px';
// lightCanvas.style.pointerEvents = 'none';
lightCanvas.width = innerWidth;
lightCanvas.height = innerHeight;
// document.querySelector('body').append(lightCanvas);
const lightCtx = lightCanvas.getContext('2d');

g_canvas.width = innerWidth;
g_canvas.height = innerHeight;


const tileSize = 8;
const scale = 3;
const scaledSize = tileSize * scale;


const mergedSquares = new Map(); // map is faster than object
const squaresToReCreate = {};
const mergedLightSquares = new Map();
const staticLights = [];

const pressedKeys = {};
const loadedChunks = {};

let FPS = 0;

let lastFpsRefresh = 0;
let delta = 0;
let lastTime = 0;
let drawCalls = 0;

let mergeSize = {
    x: 10, y: 10
}

let mousePos = {
    x: 0, y: 0
}

let squareNSize = {
    x: mergeSize.x * tileSize,
    y: mergeSize.y * tileSize
}

const CAMERA = {
    x: 0,
    y: 0,
    speed: 0.5,
}
function moveCamera(){
    if (pressedKeys['w']){
        CAMERA.y += Math.round(CAMERA.speed * delta / scale) * scale;
    }
    if (pressedKeys['s']){
        CAMERA.y -= Math.round(CAMERA.speed * delta / scale) * scale;
    }
    if (pressedKeys['a']){
        CAMERA.x += Math.round(CAMERA.speed * delta / scale) * scale;
    }
    if (pressedKeys['d']){
        CAMERA.x -= Math.round(CAMERA.speed * delta / scale) * scale;
    }

}

const loadedImages = {};
const loadedImageDatas = {};

let imageList = ['dirt.png', 'grass.png', 'light.png', 'wood.png', 'stone.png', 'lightBlock.png'];

function randomInt(max){
    return Math.floor(Math.random() * (max + 1));
}

const chunkHeightMap = {};

function generateChunk(chunkX, chunkY){
    let generated = new Uint8Array(mergeSize.x * mergeSize.y).fill(4);
    
    let randomness = 0.015;

    if (!chunkHeightMap[chunkX]){
        let mapX = chunkX * mergeSize.x;

        // generate
        
        let arr = [];
        
        for (let i = 0; i < mergeSize.x; i++){
            let h = Math.floor((noise2D((mapX+i)*randomness, 0)) * 20) + 100;
            arr.push(-h);
        }

        chunkHeightMap[chunkX] = arr;
        // mapGenerator.lastHeightValue = h;


    }

    let heights = chunkHeightMap[chunkX];
    
    for (let i = 0; i < generated.length; i++){
        generated[i] = Math.random() > 0.5 ? 1 : 4;
        
        let y = chunkY * mergeSize.x + Math.floor(i / mergeSize.x);
        
        if (chunkX == -0) chunkX = 0;
        
        let maxHeight = heights[i % mergeSize.x]; 

        if (y < maxHeight){
            generated[i] = 0;
        }else if (y == maxHeight){
            generated[i] = 2;
            
        }else if (y == maxHeight + 1 || y == maxHeight + 2 || y == maxHeight + 3){
            generated[i] = 1;
        }
        // console.log(y);
    }
    return generated;
}

const c_IDList = {
    1: {img: 'dirt.png'},
    2: {img: 'grass.png'},
    3: {img: 'wood.png'},
    4: {img: 'stone.png'},
    99: {img: 'lightBlock.png', light: true, power: 800, colored: false},
}
let tileData;
function loadImages(next){
    const load = (index) => {
        let img = new Image();
        img.src = imageList[index];
        img.onload = () => {
            loadedImages[imageList[index]] = img;

            let canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            let ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0);

            let imageData = ctx.getImageData(0, 0, img.width, img.height);

            loadedImageDatas[imageList[index]] = imageData.data;
            tileData = imageData.data;
            
            if (index+1 == imageList.length && next){
                next();
                return;
            } 
            load(index+1);
            
        }
    }
    load(0);
}
function clearLight(){
    lightCtx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
}

let numberOfLights = 0;

let lightCalls = 0;
function removeStaticLight(light){
    let power = light.power;
    let range = Math.floor(power/ 2  / (mergeSize.x * scaledSize));
    if (range < 1) range = 1;
    for (let i = -range; i < range+1; i++){
        for (let j = -range; j < range+1; j++){
            let chunkX = light.chunkX+i;
            let chunkY = light.chunkY+j;
            let lightSquare = lookForMergedLightSquare(customHash(chunkX, chunkY));
            if (!lightSquare) continue;
            
            let canvas = lightSquare.canvas;
            let ctx = canvas.getContext('2d');
            let chunkPos = {
                x: chunkX * (mergeSize.x * scaledSize),
                y: chunkY * (mergeSize.x * scaledSize),
            }
            // set chunks to dark
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // regenerete remaining lights
            for (let k = lightSquare.lights.length-1; k >= 0; k--){
                let otherLight = lightSquare.lights[k];
                if (otherLight.x == light.x && otherLight.y == light.y){
                    lightSquare.lights.splice(k, 1);
                    continue;
                }
                // console.log(otherLight);
                lightCalls++;
                drawStaticLight(ctx, otherLight.x - chunkPos.x, otherLight.y - chunkPos.y, otherLight.power, otherLight.colored);
            }
        }    
    }
    staticLights.splice(staticLights.indexOf(light), 1);
}
function addStaticLight(x, y, power, colored = false){
    let isThere = lookForLightIndex(x, y);
    if (isThere && isThere.power >= power && colored == isThere.colored) return;
    let light = {
        // pos
        // chunk pos
        colored: colored,
        power: power,
        x: x,
        y: y,
        chunkX: Math.floor(x / (mergeSize.x * scaledSize)),
        chunkY: Math.floor(y / (mergeSize.y * scaledSize)),
    }
    if (!isThere) staticLights.push(light);
    else {
        isThere.power = power;
        isThere.colored = colored;
    }
    // update chunks
    let range = Math.floor(power/ 2  / (mergeSize.x * scaledSize));
    if (range < 1) range = 1;
    for (let i = -range; i < range+1; i++){
        for (let j = -range; j < range+1; j++){
            let chunkX = light.chunkX+i;
            let chunkY = light.chunkY+j;
            let lightSquare = lookForMergedLightSquare(customHash(chunkX,chunkY));
            if (!lightSquare) continue;

            lightSquare.lights.push(light);
            
            let ctx = lightSquare.canvas.getContext('2d');
            let chunkPos = {
                x: chunkX * (mergeSize.x * scaledSize),
                y: chunkY * (mergeSize.x * scaledSize),
            }
            lightCalls++;
            drawStaticLight(ctx, x - chunkPos.x, y - chunkPos.y, power, colored);       
        }    
    }
}
function lookForLight(x, y){
    for (let i = 0; i < staticLights.length; i++){
        if (staticLights[i].x == x && staticLights[i].y == y) return staticLights[i];
    }
    return false;
}
function lookForLightIndex(x, y){
    for (let i = 0; i < staticLights.length; i++){
        if (staticLights[i].x == x && staticLights[i].y == y) return i;
    }
    return false;
}

function drawLights(){    
    numberOfLights = 0;

    drawDynamicLight(mousePos.x, mousePos.y, 400, false);

    g_ctx.drawImage(lightCanvas, 0, 0);
}
let operation = 'destination-out';
function drawStaticLight(ctx, x, y, power, colored = false){
    ctx.globalCompositeOperation = operation;
    ctx.drawImage(loadedImages['light.png'], x - power/2, y - power/2, power, power);
    ctx.globalCompositeOperation = 'source-over';    
    if (colored){
        let colorPower = power/1.3;
        ctx.globalAlpha = 0.4;
        ctx.drawImage(loadedImages['light.png'], x - colorPower / 2 , y - colorPower / 2, colorPower, colorPower);
        ctx.globalAlpha = 1;    
    }
}
function removeAllTiles(){ // test
    let sizeX = Math.floor(g_canvas.width / scaledSize);
    let sizeY = Math.floor(g_canvas.height / scaledSize);
    for (let i = 0; i < sizeX+1; i++){
        for (let j = 0; j < sizeY+1; j++){
            removeTile(i ,j);
        }    
    }
}
function drawDynamicLight(x, y, power, colored = false){
    numberOfLights++;
    if (numberOfLights > 500) return;
    drawStaticLight(lightCtx, x, y, power, colored);
}
function clearScreen(){
    g_ctx.beginPath();
    g_ctx.fillStyle = 'black';
    g_ctx.fillRect(0, 0, g_canvas.width, g_canvas.height);
    g_ctx.closePath();
    lightCtx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
}

//reusable chunk offscreen canvas
let chunkCanvas = document.createElement('canvas');
chunkCanvas.width = squareNSize.x; 
chunkCanvas.height = squareNSize.y; 

let chunkCtx = chunkCanvas.getContext('2d');
chunkCtx.imageSmoothingEnabled = false  

function drawMap(){
    let sizeX = Math.floor(g_canvas.width / scaledSize);
    let sizeY = Math.floor(g_canvas.height / scaledSize);

    let mergeX = sizeX / mergeSize.x; 
    let mergeY = sizeY / mergeSize.y;

    let calls = 0;

    // mergesize = 240
    // -120 start = -120 / 240 = -0.5 = -1 = correct

    let squareSize = {
        x: mergeSize.x * scaledSize,
        y: mergeSize.y * scaledSize
    }

    let start = {
        x: Math.floor(-CAMERA.x / (squareSize.x)), 
        y: Math.floor(-CAMERA.y / (squareSize.y)),  
    }
    let finish = {
        x: mergeX + start.x,
        y: mergeY + start.y,
    }

    let scaledCamera = {
        x: Math.round(CAMERA.x / scale),
        y: Math.round(CAMERA.y / scale),
    }

    // let niceOff = document.createElement('canvas');
    // niceOff.width = Math.floor(g_canvas.width / scale);
    // niceOff.height = Math.floor(g_canvas.height / scale);
    // let niceOffCtx = niceOff.getContext('2d');
    // niceOffCtx.imageSmoothingEnabled = false;
    for (let i = start.x; i < finish.x + 1; i++){
        for (let j = start.y; j < finish.y+1; j++){            
            let hash = customHash(i,j);

            let cameraPos = {
                x: squareSize.x * i + CAMERA.x,
                y: squareSize.y * j + CAMERA.y
            }
  
            let chunkID = i+':'+j;
            let chunk;
            if (!loadedChunks[chunkID]){
                chunk = generateChunk(i, j);
            }else{
                chunk = loadedChunks[chunkID].map;
            }

            // let lightSquare = mergedLightSquares[hash];
            // if (lightSquare){
            //     calls++;
            //     lightCtx.drawImage(lightSquare.canvas, cameraPos.x, cameraPos.y);
            // }else{
            //     // let tempCanvas = document.createElement('canvas');
            //     // tempCanvas.width = squareSize.x; 
            //     // tempCanvas.height = squareSize.y; 

            //     // let tempCtx = tempCanvas.getContext('2d');
                                
            //     chunkCtx.fillStyle = 'black';
            //     chunkCtx.fillRect(0, 0, squareSize.x, squareSize.y);

            //     mergedLightSquares[hash] = {lights: [], canvas: chunkCanvas};
            //     // tempCanvas = null;
            //     // tempCtx = null;
            // } 

            let square = mergedSquares[hash];
            if (square && !squaresToReCreate[hash]){
                // draw merge
                calls++;
                g_ctx.drawImage(square, cameraPos.x, cameraPos.y, square.width * scale, square.height * scale);
                
            }else{
                // recreate
                // tempCtx.clearRect(0, 0, squareNSize.x, squareNSize.y);     
                
                let imageData = new ImageData(squareNSize.x, squareNSize.y);
                let cData = imageData.data;
                
                for (let y = 0; y < mergeSize.y; ++y){
                    for (let x = 0; x < mergeSize.x; ++x){                        
                        let index = y * mergeSize.x + x; // in this chunk not on map
 
                        let mapID = chunk[index];

                        let tile = c_IDList[mapID];
                        if (!tile) continue;
                        // let img = loadedImages[tile.img];
                        let tileData = loadedImageDatas[tile.img];

                        let pos = {
                            x: tileSize * x,
                            y: tileSize * y,
                        }

                        for (let w = 0; w < tileSize; w++){
                            for (let h = 0; h < tileSize; h++){
                                let tIndex = (h * tileSize + w) * 4;
                                // drawCalls++;
                                let pData = ( ~~(pos.x + w) + ~~(pos.y + h) * squareNSize.x) * 4;
                
                                cData[pData] = tileData[tIndex];
                                cData[pData + 1] = tileData[tIndex + 1];
                                cData[pData + 2] = tileData[tIndex + 2];
                                cData[pData + 3] = tileData[tIndex + 3];
                            }                
                        }                                        
                        
                        // tempCtx.drawImage(img, tileSize * x, tileSize * y);
                        calls++;
                    }            
                }
                chunkCtx.putImageData(imageData, 0, 0);
                loadedChunks[chunkID] = {
                    x: i,
                    y: j,
                    map: chunk
                }
                g_ctx.drawImage(chunkCanvas, cameraPos.x, cameraPos.y, chunkCanvas.width * scale, chunkCanvas.height * scale);

                if (square){
                    createImageBitmap(chunkCanvas).then((image) => mergedSquares[hash] = image); 
                    delete squaresToReCreate[hash];
                    continue
                }
                createImageBitmap(chunkCanvas).then((image) => mergedSquares[hash] = image);
                // tempCanvas = null;
                // tempCtx = null;
                // mergedSquares.push({x: i, y: j, canvas: tempCanvas});
            } 
        }
    }
    // g_ctx.drawImage(niceOff, 0, 0, niceOff.width * scale, niceOff.height * scale);
    return calls;
}
function setAlltoRecreate(){
    for (let i = 0; i < mergedSquares.length; i++){
        mergedSquares[i].reCreate = true;
    }
}

function lookForMergedSquare(key){
    return mergedSquares[key];
    // for (let i = 0; i < mergedSquares.length; i++){
    //     if (mergedSquares[i].x == x && mergedSquares[i].y == y) return mergedSquares[i];
    // }
    // return false;
}
function lookForMergedLightSquare(key){
    return mergedLightSquares[key];
    // for (let i = 0; i < mergedLightSquares.length; i++){
    //     if (mergedLightSquares[i].x == x && mergedLightSquares[i].y == y){
    //         if (show) console.log(performance.now() - time);
    //         return mergedLightSquares[i];
    //     } 
    // }
    // if (show) console.log(performance.now() - time);
    // return false;
}

function drawMergeLines(){
    let sizeX = Math.floor(g_canvas.width / scaledSize);
    let sizeY = Math.floor(g_canvas.height / scaledSize);

    let linesX = sizeX / mergeSize.x; 
    let linesY = sizeY / mergeSize.y; 

    let lineSpaceX = mergeSize.x * scaledSize;
    let lineSpaceY = mergeSize.y * scaledSize;

    let merges = 0;

    let lineOffset = {
        x: CAMERA.x % (mergeSize.x * scaledSize),
        y: CAMERA.y % (mergeSize.y * scaledSize),
    }

    for (let i = 0; i < linesX+1; i++){ // vertical
        g_ctx.strokeStyle = 'blue';
        g_ctx.moveTo(i * lineSpaceX + lineOffset.x, 0);
        g_ctx.lineTo(i * lineSpaceX + lineOffset.x, g_canvas.height);
        g_ctx.lineWidth = 1;
        g_ctx.stroke();
    }
    for (let i = 0; i < linesY+1; i++){ // horizontal
        g_ctx.strokeStyle = 'blue';
        g_ctx.moveTo(0, i * lineSpaceY + lineOffset.y);
        g_ctx.lineTo(g_canvas.width, i * lineSpaceY + lineOffset.y);
        g_ctx.lineWidth = 1;
        g_ctx.stroke();
    }
}
function drawFps(){
    let sizeX = Math.floor(g_canvas.width / scaledSize) + 1;
    let sizeY = Math.floor(g_canvas.height / scaledSize) + 1;

    let mergeX = sizeX / mergeSize.x; 
    let mergeY = sizeY / mergeSize.y;

    let drawnElements = Math.floor(mergeSize.x * mergeSize.y * mergeX * mergeY);

    g_ctx.beginPath();
    g_ctx.fillStyle = 'white';
    g_ctx.font = '20px Arial';
    g_ctx.fillText(`${fpsCounter.average} FPS l/h: ${fpsCounter.lastValues.low}/${fpsCounter.lastValues.high}`, 10, 20);
    g_ctx.fillText(drawCalls+' Draw calls', 10, 40);
    g_ctx.fillText(scale+' scale', 10, 60);
    g_ctx.fillText(drawnElements+' Drawn Elements', 10, 80);
    g_ctx.fillText(numberOfLights+' Dynamic Lights', 10, 100);
    g_ctx.fillText('Camera x:'+CAMERA.x + ' y: '+CAMERA.y, 10, 120);
    g_ctx.fillText('seed: '+seed, 10, 140);
    g_ctx.fillText('squares: '+Object.values(mergedSquares).length, 10, 160);
    g_ctx.closePath();
}

function drawTile(x, y, size, _ctx){
    _ctx.beginPath();
    _ctx.drawImage(dirtTex, x, y, size, size);
    _ctx.closePath();
}
function removeTile(x, y){
    reCreateAt(x, y);
}
function placeBlock(x, y, id){
    let chunkPos = {
        x: Math.floor(x / mergeSize.x),
        y: Math.floor(y / mergeSize.y),
    }
    let chunkID = chunkPos.x + ':' + chunkPos.y;
    let chunk = loadedChunks[chunkID];

    if (!chunk) return;

    let inChunkPos = {
        x: x - mergeSize.x * chunkPos.x,
        y: y - mergeSize.y * chunkPos.y,
    }
    let mapIndex = inChunkPos.y * mergeSize.x + inChunkPos.x;

    // console.log(chunk, loadedChunks, chunkID);
    chunk.map[mapIndex] = id;

    let block = c_IDList[id];

    if (block.light){
        addStaticLight(x * scaledSize + scaledSize / 2, y * scaledSize + scaledSize / 2, block.power, block.colored);    
    }

    reCreateAt(x, y);
}
function placeLightBlock(x, y){
    placeBlock(x, y, 99);
}
function reCreateAt(x, y){
    let hash = customHash(Math.floor(x / mergeSize.x), Math.floor(y / mergeSize.y))
    let square = mergedSquares[hash];
    if (square) squaresToReCreate[hash] = 1;
}
let fpsCounter = {
    accumulator: 0,
    average: 0,
    i: 0,
    lowest: 100000,
    highest: 0,
    lastValues: {
        high: '-',
        low: '-'
    },
    initialized: false,
}
// let imageData = new ImageData(g_canvas.width, g_canvas.height);
let mapSize = {
    x: Math.floor(g_canvas.width / scaledSize),
    y: Math.floor(g_canvas.height / scaledSize),
}
function testDraw(){
    if (!tileData) return;
    var imageData = g_ctx.createImageData(Math.floor(g_canvas.width / scale), Math.floor(g_canvas.height / scale));
    let data = imageData.data;
    let width = g_canvas.width / scale;

    for (let i = 0; i < mapSize.x + 1; i++){
        for (let j = 0; j < mapSize.y + 1; j++){   
            let pos = {
                x: tileSize * i,
                y: tileSize * j
            }     
            for (let w = 0; w < tileSize; w++){
                for (let h = 0; h < tileSize; h++){
                    let index = (h * tileSize + w) * 4;
                    // drawCalls++;
                    let pData = ( ~~(pos.x + w) + ~~(pos.y + h) * width) * 4;
    
                    data[pData] = tileData[index];
                    data[pData + 1] = tileData[index + 1];
                    data[pData + 2] = tileData[index + 2];
                    data[pData + 3] = tileData[index + 3];
                }                
            }    
        }             
    }
        
    // console.log(times);
    
    let tempCanvas = document.createElement('canvas');
    let tempCtx = tempCanvas.getContext('2d');
    
    tempCanvas.width = g_canvas.width / scale;
    tempCanvas.height = g_canvas.height / scale;

    tempCtx.putImageData(imageData, 0, 0);

    g_ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width * scale, tempCanvas.height * scale);   
    tempCanvas = null;
    tempCtx = null;
}
function lightTestDraw(){
    lightCtx.fillStyle = '#00000060';
    lightCtx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
    g_ctx.drawImage(lightCanvas, 0, 0);

}
function gameLoop(){
    requestAnimationFrame(gameLoop);
    g_ctx.imageSmoothingEnabled = false;
    stats.begin();
    let now = performance.now();
    delta = now - lastTime;
    lastTime = performance.now();
    clearScreen();
    drawCalls = drawMap();
    drawLights();
    // testDraw();
    lightTestDraw();
    
    // UI layer
    drawMergeLines();
    drawFps();
    
    moveCamera();


    
    FPS = Math.floor(1 / delta * 1000);

    if (!fpsCounter.initialized) fpsCounter.average = FPS;
    fpsCounter.accumulator += FPS;
    if (FPS > fpsCounter.highest) fpsCounter.highest = FPS;
    if (FPS < fpsCounter.lowest) fpsCounter.lowest = FPS;
    fpsCounter.i++;
    if (performance.now() - lastFpsRefresh > 1000){
        fpsCounter.average = Math.floor(fpsCounter.accumulator / fpsCounter.i); 
        fpsCounter.accumulator = 0;
        fpsCounter.lastValues = {
            high: fpsCounter.highest,
            low: fpsCounter.lowest,
        }        
        fpsCounter.lowest = 100000;
        fpsCounter.highest = 0;
        fpsCounter.i = 0;
        fpsCounter.initialized = true;
        lastFpsRefresh = performance.now();
    }
    stats.end()
}
loadImages(() => {
    gameLoop();
    setTimeout(() => {
        placeBlock(20, 10, 99);
        placeBlock(20, 30, 99);
        placeBlock(10, 20, 99);
        placeBlock(30, 20, 99);
        placeBlock(20, 20, 99);
    },100);
    // allLights();
});
function allLights(){
    let sizeX = Math.floor(g_canvas.width / scaledSize);
    let sizeY = Math.floor(g_canvas.height / scaledSize);
    lightCalls = 0;
    for (let i = 0; i < sizeX+1; i++){
        for (let j = 0; j < sizeY+1; j++){
            addStaticLight(i * scaledSize + scaledSize / 2, j * scaledSize + scaledSize / 2, 400);    
        }    
    }
    console.log(lightCalls);

}
function lerp(a, b, t) {
    return a + (b - a) * t;
}
function smoothTransition(start, end, numSteps) {
    const stepSize = (end - start) / (numSteps - 1);
    const result = [];

    for (let i = 0; i < numSteps; i++) {
        result.push(Math.round(start + i * stepSize));
    }

    return result;
}
function customHash(x, y) {
    // Use bitwise operations to ensure negative numbers are treated correctly
    return (x << 16) ^ y;
}
document.addEventListener('mousedown', (e) => {
    let x = e.clientX;
    let y = e.clientY;   
    let tileX = Math.floor((x - CAMERA.x) / scaledSize);
    let tileY = Math.floor((y - CAMERA.y) / scaledSize);
    if (e.button == 0){
        let lightPos = {
            x: tileX*scaledSize + scaledSize / 2,
            y: tileY*scaledSize + scaledSize / 2,
        }
        let light = lookForLight(lightPos.x, lightPos.y);
        if (!light) {
            placeLightBlock(tileX, tileY);
        }else{
            console.log('remove light');
            placeBlock(tileX, tileY, 1);
            lightCalls = 0;
            removeStaticLight(light);
            reCreateAt(tileX, tileY);
        }
    }
});
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('mousemove', (e) => {
    let x = e.clientX;
    let y = e.clientY;   
    mousePos = {x: x, y: y};    
});
document.addEventListener('keydown', (e) => {
    let key = e.key.toLowerCase();
    pressedKeys[key] = 1;
});
document.addEventListener('keyup', (e) => {
    let key = e.key.toLowerCase();
    delete pressedKeys[key];
});

// zadanie domowe 

// Skonstruuj diagram E-R dla firmy ubezpieczeniowej, której klienci posiadają jeden lub więcej samochodów.
// Każdy samochód skojarzył z nim zero do dowolnej liczby zarejestrowanych wypadków.
// Każda polisa ubezpieczeniowa obejmuje jeden lub więcej samochodów i wiąże się z jedną lub więcej opłatami składek.
// Każda płatność dotyczy określonego okresu i wiąże się z terminem płatności oraz datą otrzymania płatności.


// Skonstruuj diagram E-R d dla światowej firmy dostarczającej przesyłki (np. DHL lub FedEx). 
// Baza danych musi umożliwiać śledzenie klientów, którzy wysyłają przedmioty i klientów, którzy otrzymują przedmioty; 
// niektórzy klienci mogą robić jedno i drugie. Każdy pakiet musi być identyfikowalny i możliwy do śledzenia,
//  więc baza danych musi być w stanie przechowywać lokalizację pakietu i jego historię lokalizacji. Lokalizacje obejmują ciężarówki,
// samoloty, lotniska i magazyny.