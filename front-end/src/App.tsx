/*
 * @Author: Antoine YANG 
 * @Date: 2020-08-20 22:51:17 
 * @Last Modified by: Antoine YANG
 * @Last Modified time: 2020-08-20 22:54:18
 */

import React, { Component } from 'react';
import './App.css';
import { Map } from "./Comp/Map";


class App extends Component<{}, {}, {}> {
  public constructor(props: {}) {
    super(props);
  }

  public render(): JSX.Element {
    return (
      <div className="App">
        <Map id="map0" width={ 800 } height={ 600 } />
      </div>
    );
  }
}

export default App;
