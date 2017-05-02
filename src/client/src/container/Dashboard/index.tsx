/* 
  The most common ancestor will be a 'container' (stateful) component that encapsulates behavior dealing with state.
  All expensive operations will take place in the container component, and will communicate with the store in the process.

  Use the mapStateToProps and mapDispatchToProps to connect this component to the store.
*/

import * as React from 'react';
import { connect } from 'react-redux';

import { PART_SIZE, BASE_URI, FILENAME_PATTERN } from '../../constants';
import { addFile, updateProgress } from '../../actions';

import presentational from '../../presentational/';

import axios from 'axios';
import * as moment from 'moment';
import * as Rx from 'rxjs';

import './style.css';

const { Uploader, UploadProgress } = presentational;

// Math
const computeProgress = (loaded, fileSize) => Math.floor((loaded / fileSize) * 100);
const computeElapsedTime = (unit) => (startTime) => moment().diff(startTime, unit) || 1;
const computeElapsedSeconds = computeElapsedTime('seconds');
const computeSpeed = (loaded, startTime) => Math.floor(loaded / computeElapsedSeconds(startTime));

const capAtFilesize = (value, fileSize) => value > fileSize ? fileSize : value;

const createFileParts = (file, fileName, uploadOffset, uploadLength, partNumber, parts) => {
  if (uploadOffset >= file.size) return parts;

  // 0:2, 3:4, 5:6
  // 0:2, 0:1, 0:1
  // 2 bytes to be transferred; 1 byte to be transferred; 1 byte to be transferred;
  // bytesToBeTransferred = (len - offset)
  // upperBoundPart = bytesToBeTransferred
  // lowerBoundPart = 0
  // Therefore, we only transfer bytes when (bytesToBeTransferred - lowerBoundPart) > 0;
  
  parts.push({
    file: file.slice(uploadOffset, uploadLength + 1),
    fileName,
    partNumber,
    uploadOffset: capAtFilesize(uploadOffset, file.size),
    uploadLength: capAtFilesize(uploadLength, file.size)
  });
  return createFileParts(file, fileName, capAtFilesize(uploadOffset + PART_SIZE, file.size), capAtFilesize(uploadLength + PART_SIZE, file.size), partNumber + 1, parts);
}

const onFileNotExist = (dispatch, fileName, parts) => () => {
  console.log(`File not found. Creating directory for file, ${fileName}`);
  axios.post(`${BASE_URI}`, null, {
    headers: {
      fileName
    }
  }).then(resp => {
    const { headers } = resp;
    console.log(`Created directory, ${headers.filedir}`);
    dispatch(addFile(parts));
  });
}

const onLoadEnd = (dispatch, file) => () => {
  const fileName = FILENAME_PATTERN.exec(file.name)[1];
  const parts = createFileParts(file, fileName, 0, PART_SIZE, 0, []);
  const partNumbers = parts.map(part => part.partNumber);  

  axios.head(`${BASE_URI}`, {
    headers: {
      fileName,
      partNumbers
    }
  })
  .then(resp => console.log(resp))
  .catch(onFileNotExist(dispatch, fileName, parts));
}

const onAddFile = dispatch => event => {
  const reader = new FileReader();
  const file = event.target.files[0];
  reader.onloadend = onLoadEnd(dispatch, file);
  reader.readAsDataURL(file);
}

const uploadPart = dispatch => startTime => part => {
  const { partNumber, uploadOffset, uploadLength, file, fileName } = part;

  return axios.patch(`${BASE_URI}/${fileName}`, file, {
    headers: {
      'content-type': 'text/plain',
      fileName,
      partNumber,
      uploadOffset,
      uploadLength,
      userName: 'cjvirtucio'
    },
    onUploadProgress(ev) {
      const progress = computeProgress(ev.loaded, file.size);
      const speed = computeSpeed(ev.loaded, startTime);

      dispatch(updateProgress({ partNumber, progress, speed }));
      // if (progress === 100) dispatch(donePart(file));
    }
  })
  .then(resp => console.log(resp));
};

const onUploadFile = dispatch => parts => event => {
  const startTime = moment();

  console.log('Uploading.');

  Rx.Observable.from(parts)
    .subscribe(uploadPart(dispatch)(startTime));
}

// Store Connectors
const mapStateToProps = (state) => ({
  file: state.file,
  parts: state.parts,
  progressData: state.progressData
});

const mapDispatchToProps = (dispatch) => ({
  onAddFile: onAddFile(dispatch),
  onUploadFile: onUploadFile(dispatch)
});

const Dashboard = ({ onAddFile, onUploadFile, parts, progressData }) => (
  <div className='Dashboard container-fluid'>
    <section className='row align-items-center justify-content-center'>
      <div className='col-4'>
        <h3>File Uploader</h3>
        <p>Upload a file. The client slices it into chunks and will fire off a request for each one when you hit the upload button.</p>
      </div>
      <div className='col-4'>
        <Uploader
          onAddFile={ onAddFile }
          onUploadFile={ onUploadFile }
          parts={ parts }
        />
      </div>
    </section>
    <section className='row align-items-center justify-content-center'>
      <div className='col-4'>
        <h3>Upload Progress</h3>
        <p>This component will reveal a table showing the progress of each chunk.</p>
      </div>
      <div className='col-4'>
        <UploadProgress
          parts={ parts }
          progressData={ progressData }
        />
      </div>
    </section>
  </div>
);

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Dashboard);