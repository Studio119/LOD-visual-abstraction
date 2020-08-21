/*
 * @Author: Antoine YANG 
 * @Date: 2020-08-20 22:43:10 
 * @Last Modified by: Antoine YANG
 * @Last Modified time: 2020-08-20 22:56:45
 */

import React, { Component } from "react";
import MapBox from "../react-mapbox/MapBox";


export interface MapProps {
    id: string;
    width: number;
    height: number;
};

export interface MapState {};

export class Map extends Component<MapProps, MapState, {}> {

    public constructor(props: MapProps) {
        super(props);
    }

    public render(): JSX.Element {
        return (
            <div>
                <div id={ this.props.id } style={{
                    display: "block",
                    width: this.props.width,
                    height: this.props.height
                }} >
                    <MapBox containerID={ this.props.id }
                    accessToken="pk.eyJ1IjoiaWNoZW4tYW50b2luZSIsImEiOiJjazF5bDh5eWUwZ2tiM2NsaXQ3bnFvNGJ1In0.sFDwirFIqR4UEjFQoKB8uA"
                    center={ [-4, 54] } zoom={ 5 } allowInteraction={ true }
                    minZoom={ 1 } maxZoom={ 15 }
                    onDragEnd={ () => {} } onZoomEnd={ () => {} } />
                </div>
            </div>
        );
    }
};
