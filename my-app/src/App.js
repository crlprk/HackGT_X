import React, { useState } from 'react';
import './App.css';
import PKSL from './PKSL.svg';
import shutter from './shutter.svg';
import viewfinder_preview from './viewfinder.svg';
import toggle_save from './toggle_save.svg';

function App() {
  const [appState, setAppState] = useState(0); 

  // *************************************************
  // * Constants
  // *************************************************

  var MAX_K_MEANS_PIXELS = 50000
  var rng_seed;
  var centroids;

  var download_img = false;

  //*************************************************
  //* Image/Data Processing
  //*************************************************

  // Checks for equality of elements in two arrays.
  var arrays_equal = function(a1, a2) {
    if (a1.length !== a2.length) return false;
    for (var i = 0; i < a1.length; ++i) {
      if (a1[i] !== a2[i]) return false;
    }
    return true;
  };

  // Given width w and height h, rescale the dimensions to satisfy
  // the specified number of pixels.
  var rescale_dimensions = function(w, h, pixels) {
    var aspect_ratio = w / h;
    var scaling_factor = Math.sqrt(pixels / aspect_ratio);
    var rescaled_w = Math.floor(aspect_ratio * scaling_factor);
    var rescaled_h = Math.floor(scaling_factor);
    return [rescaled_w, rescaled_h];
  };

  // Given an Image, return a dataset with pixel colors.
  // If resized_pixels > 0, image will be resized prior to building
  // the dataset.
  // return: [[R,G,B,a], [R,G,B,a], [R,G,B,a], ...]
  var get_pixel_dataset = function(img, resized_pixels) {
    if (resized_pixels === undefined) resized_pixels = -1;
    // Get pixel colors from a <canvas> with the image
    var canvas = document.createElement("canvas");
    var img_n_pixels = img.width * img.height;
    var canvas_width = img.width;
    var canvas_height = img.height;
    if (resized_pixels > 0 && img_n_pixels > resized_pixels) {
      var rescaled = rescale_dimensions(img.width, img.height, resized_pixels)
      canvas_width = rescaled[0];
      canvas_height = rescaled[1];
    }
    canvas.width = canvas_width;
    canvas.height = canvas_height;
    var canvas_n_pixels = canvas_width * canvas_height;
    var context = canvas.getContext("2d");
    context.drawImage(img, 0, 0, canvas_width, canvas_height);  
    var flattened_dataset = context.getImageData(
        0, 0, canvas_width, canvas_height).data;
    var n_channels = flattened_dataset.length / canvas_n_pixels;
    var dataset = [];
    for (var i = 0; i < flattened_dataset.length; i += n_channels) {
      dataset.push(flattened_dataset.slice(i, i + n_channels));
    }
    return dataset;
  };

  // Given a point and a list of neighbor points, return the index
  // for the neighbor that's closest to the point.
  var nearest_neighbor = function(point, neighbors) {
    var best_dist = Infinity; // squared distance
    var best_index = -1;
    for (var i = 0; i < neighbors.length; ++i) {
      var neighbor = neighbors[i];
      var dist = 0;
      for (var j = 0; j < point.length; ++j) {
        dist += Math.pow(point[j] - neighbor[j], 2);
      }
      if (dist < best_dist) {
        best_dist = dist;
        best_index = i;
      }
    }
    return best_index;
  };

  // Returns the centroid of a dataset.
  var centroid = function(dataset) {
    if (dataset.length === 0) return [];
    // Calculate running means.
    var running_centroid = [];
    for (var i = 0; i < dataset[0].length; ++i) {
      running_centroid.push(0);
    }
    for (var i = 0; i < dataset.length; ++i) {
      var point = dataset[i];
      for (var j = 0; j < point.length; ++j) {
        running_centroid[j] += (point[j] - running_centroid[j]) / (i+1);
      }
    }
    return running_centroid;
  };

  // Returns the k-means centroids.
  var k_means = function(dataset, k) {
    if (k === undefined) k = Math.min(3, dataset.length);
    // Use a seeded random number generator instead of Math.random(),
    // so that k-means always produces the same centroids for the same
    // input.
    rng_seed = 0;
    var random = function() {
      rng_seed = (rng_seed * 9301 + 49297) % 233280;
      return rng_seed / 233280;
    };
    // Choose initial centroids randomly.
    centroids = [];
    for (var i = 0; i < k; ++i) {
      var idx = Math.floor(random() * dataset.length);
      centroids.push(dataset[idx]);
    }
    while (true) {
      // 'clusters' is an array of arrays. each sub-array corresponds to
      // a cluster, and has the points in that cluster.
      var clusters = [];
      for (var i = 0; i < k; ++i) {
        clusters.push([]);
      }
      for (var i = 0; i < dataset.length; ++i) {
        var point = dataset[i];
        var nearest_centroid = nearest_neighbor(point, centroids);
        clusters[nearest_centroid].push(point);
      }
      var converged = true;
      for (var i = 0; i < k; ++i) {
        var cluster = clusters[i];
        var centroid_i = [];
        if (cluster.length > 0) {
          centroid_i = centroid(cluster);
        } else {
          // For an empty cluster, set a random point as the centroid.
          var idx = Math.floor(random() * dataset.length);
          centroid_i = dataset[idx];
        }
        converged = converged && arrays_equal(centroid_i, centroids[i]);
        centroids[i] = centroid_i;
      }
      if (converged) break;
    }
    return centroids;
  };

  // Takes an <img> as input. Returns a quantized data URL.
  var quantize = function(img, colors) {
    var width = img.width;
    var height = img.height;
    var source_canvas = document.createElement("canvas");
    source_canvas.width = width;
    source_canvas.height = height;
    var source_context = source_canvas.getContext("2d");
    source_context.drawImage(img, 0, 0, width, height);
    
    // flattened_*_data = [R, G, B, a, R, G, B, a, ...] where
    // (R, G, B, a) groups each correspond to a single pixel, and they are
    // column-major ordered.
    var flattened_source_data = source_context.getImageData(
        0, 0, width, height).data;
    var n_pixels = width * height;
    var n_channels = flattened_source_data.length / n_pixels;
    
    var flattened_quantized_data = new Uint8ClampedArray(
        flattened_source_data.length);
    
    // Set each pixel to its nearest color.
    var current_pixel = new Uint8ClampedArray(n_channels);
    for (var i = 0; i < flattened_source_data.length; i += n_channels) {
      // This for loop approach is faster than using Array.slice().
      for (var j = 0; j < n_channels; ++j) {
        current_pixel[j] = flattened_source_data[i + j];
      }
      var nearest_color_index = nearest_neighbor(current_pixel, colors);
      var nearest_color = centroids[nearest_color_index];
      for (var j = 0; j < nearest_color.length; ++j) {
        flattened_quantized_data[i+j] = nearest_color[j];
      }
    }
    
    var quantized_canvas = document.createElement("canvas");
    quantized_canvas.width = width;
    quantized_canvas.height = height;
    var quantized_context = quantized_canvas.getContext("2d");
    
    var image = quantized_context.createImageData(width, height);
    image.data.set(flattened_quantized_data);
    quantized_context.putImageData(image, 0, 0);
    var data_url = quantized_canvas.toDataURL();
    return data_url;
  };

  var pre_quantize = function() {
    let quantized_img = document.querySelector("#quantized_img");
    // Clear any existing image.
    if (quantized_img.hasAttribute("src")) {
      quantized_img.removeAttribute("src");
    }
  };
  
  function pixelateImage() {
    var originalImage = document.querySelector("#pixelated_img");
    var pixelationFactor = 4;
    const canvas = document.querySelector("#pixel_canvas");
    const context = canvas.getContext("2d");
    const originalWidth = originalImage.width;
    const originalHeight = originalImage.height;
    const canvasWidth = originalWidth;
    const canvasHeight = originalHeight;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    context.drawImage(originalImage, 0, 0, originalWidth, originalHeight);
    const originalImageData = context.getImageData(
      0,
      0,
      originalWidth,
      originalHeight
    ).data;
    if (pixelationFactor !== 0) {
      for (let y = 0; y < originalHeight; y += pixelationFactor) {
        for (let x = 0; x < originalWidth; x += pixelationFactor) {
          // extracting the position of the sample pixel
          const pixelIndexPosition = (x + y * originalWidth) * 4;
          // drawing a square replacing the current pixels
          context.fillStyle = `rgba(
            ${originalImageData[pixelIndexPosition]},
            ${originalImageData[pixelIndexPosition + 1]},
            ${originalImageData[pixelIndexPosition + 2]},
            ${originalImageData[pixelIndexPosition + 3]}
          )`;
          context.fillRect(x, y, pixelationFactor, pixelationFactor);
        }
      }
    }
    originalImage.src = canvas.toDataURL();
    let pixelated_img = document.getElementById("pixelated_img");
    pixelated_img.addEventListener("animationend", () => {
      pixelated_img.classList.add("hidden");
    });
    pixelated_img.classList.remove("hidden");
    pixelated_img.classList.remove("fade-out");
    setTimeout(() => {
      pixelated_img.classList.add("fade-out");
    }, 1000);
  }

  async function getImageCaptureData(imageCapture) {
    const {imageWidth, imageHeight} = await imageCapture.getPhotoCapabilities();
    console.log("getimagedata", imageWidth, imageHeight);
  }
  
  // Quantize and then pixelate image.
  function quantize_and_pixelate_img() {
    let video = document.querySelector("#video");
    let canvas = document.querySelector("#canvas");
    // let ctx = canvas.getContext('2d');
    let img = new Image();
    let imageCapture = new ImageCapture(video.srcObject.getVideoTracks()[0]);

    getImageCaptureData(imageCapture);
    
    let vid_settings = video.srcObject.getVideoTracks()[0].getSettings();
    let vid_height = vid_settings.height;
    let vid_width = vid_settings.width;
    
    console.log("video resolution", vid_height, vid_width);

    var quantized_img_element = document.querySelector("#quantized_img");
    var pixel_img = document.querySelector("#pixelated_img");
    var a = document.createElement("a");
    var k = 12;

    img.onload = function() {
      console.log("orig", img.height, img.width);
      requestAnimationFrame(function() {
        setTimeout(function() {
        // Use a fixed maximum so that k-means works fast.
        var pixel_dataset = get_pixel_dataset(img, MAX_K_MEANS_PIXELS);
        var centroids = k_means([[0, 18, 25, 255], [0, 84, 115, 255], [237, 224, 185, 255], [238, 155, 0, 255], [174, 32, 18, 255]], 5);
        console.log("centroids", centroids);
        var data_url = quantize(img, centroids);
        quantized_img_element.src = data_url;
        pixel_img.src = data_url;
        }, 0);
      });
      pre_quantize();
    };

    quantized_img_element.onload = function() {
      console.log("quantized img loaded");
      pixelateImage();
    };

    pixel_img.onload = function() {
      pixel_img.height = vid_height;
      pixel_img.width = vid_width;
      if (download_img) {
        a.href = pixel_img.src;
        a.download = "pksl.png";
        a.click();
      }
      console.log("img", pixel_img.height, pixel_img.width);
    };

    imageCapture.grabFrame().then((imageBitmap) => {
      console.log("Took photo:", imageBitmap);
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      canvas.getContext('2d').drawImage(imageBitmap, 0, 0);
      img.src = canvas.toDataURL();
    })
    .catch((error) => {
      console.error("takePhoto() error: ", error);
    });
  }

  async function camera_button() {
    let video = document.querySelector("#video");
    let stream;

    const constraints = {video: {
        width: {
          min: 640,
          ideal: 640,
          max: 640,
        },
        height: {
          min: 320,
          ideal: 320,
          max: 320,
        },
        facingMode: "environment"
      }
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      alert("Camera permission denied");
      console.log(e);
    }

	  video.srcObject = stream;
    setAppState(1);
  }

  function toggle_download() {
    download_img = !download_img;
    console.log("download_img", download_img);
  }

  function toggle_mirror() {
    let video = document.querySelector("#video");
    let img = document.querySelector("#pixelated_img");

    video.classList.toggle("mirror");
    img.classList.toggle("mirror");
  }

  return (
    <div className="App">
    <header className = "App-header">
      <div className={appState != 0 ? "splash hidden" : "splash"}>
        <button className="pksl_logo" onClick={camera_button}>
          <img src={PKSL} alt="PKSL logo" />
        </button>
      </div> 
      <div className={appState != 1 ? "camera hidden" : "camera"}>
        <div className={/*"mirror*/ "viewfinder"}>
          <video className="video" id="video" autoPlay></video>
          <img className="pixelated" id = "pixelated_img"></img>
          <img className="viewfinder_preview" src={viewfinder_preview} alt="viewfinder preview" />
        </div>
        <button className="shutter" onClick={quantize_and_pixelate_img}>
          <img src={shutter} alt="camera button" />
        </button>
        <button className="toggle" onClick={toggle_download}>
          <img src={toggle_save} alt="toggle save" />
        </button>
        {/*<button onClick={toggle_mirror}>Toggle Mirror</button>*/}
        <img hidden className = "mirror" id = "quantized_img"></img>
        <canvas hidden id="pixel_canvas"></canvas>
        <canvas hidden id="canvas"></canvas>
      </div>
      
    </header>
    </div>
  );
}

export default App;

