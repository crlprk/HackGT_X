import React, { useState } from 'react';
import './App.css';

function App() {
  const [appState, setAppState] = useState(0);
  async function camera_button() {
    let video = document.querySelector("#video");
    let stream;

    const constraints = {video: {
        width: {
          min: 1280,
          ideal: 1920,
          max: 2560,
        },
        height: {
          min: 720,
          ideal: 1080,
          max: 1440,
        },
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

  function click_photo() {
    let video = document.querySelector("#video");
    let img = document.querySelector("#img");
    let imageCapture = new ImageCapture(video.srcObject.getVideoTracks()[0]);
    let img_blob;

    imageCapture.takePhoto().then((blob) => {
      img_blob = blob;
      img.classList.remove("hidden");
      img.src = URL.createObjectURL(blob);
    })
    .catch((error) => {
      console.error("takePhoto() error: ", error);
    });

    console.log("Took photo:", img_blob);
  }

  return (
    <div className="App">
      <header className = "App-header">
        {appState === 0 && <button onClick={camera_button}>PKSL</button>}
        <video className = "mirror" id="video" width="1920" height="1080" autoPlay></video>
        <button onClick={click_photo}>Click Photo</button>
        <img className = "mirror" id = "img"></img>
      </header>
    </div>
  );
}
export default App;


