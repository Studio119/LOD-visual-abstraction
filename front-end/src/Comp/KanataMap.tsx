/*
 * @Author: Antoine YANG 
 * @Date: 2020-08-20 22:43:10 
 * @Last Modified by: Antoine YANG
 * @Last Modified time: 2020-08-22 23:17:56
 */

import React, { Component } from "react";
import MapBox from "../react-mapbox/MapBox";


export interface KanataMapProps {
    accessToken: string;
    id: string;
    width: number;
    height: number;
    before?: React.ReactNode;
    after?: React.ReactNode;
};

export class KanataMap<P = {}, S = {}> extends Component<KanataMapProps & P, S, {}> {

    protected map: React.RefObject<MapBox>;

    protected canvasScatter: React.RefObject<HTMLCanvasElement>;
    protected ctxScatter: CanvasRenderingContext2D | null;

    public constructor(props: KanataMapProps & P) {
        super(props);

        this.map = React.createRef<MapBox>();
        this.canvasScatter = React.createRef<HTMLCanvasElement>();
        this.ctxScatter = null;
    }

    public render(): JSX.Element {
        return (
            <div>
                { this.props.before }
                <div key="mapbox-container" id={ this.props.id } style={{
                    display: "block",
                    width: this.props.width,
                    height: this.props.height,
                    backgroundColor: "rgb(27,27,27)"
                }} >
                    <MapBox ref={ this.map } containerID={ this.props.id }
                    accessToken={ this.props.accessToken }
                    center={ [-0.1132, 51.4936] } zoom={ 9.2 } allowInteraction={ true }
                    styleURL="mapbox://styles/ichen-antoine/cke5cvr811xb419mi5hd9otc3"
                    minZoom={ 1 } maxZoom={ 15 }
                    onBoundsChanged={ () => {
                        this.repaint();
                    } } />
                </div>
                <div key="canvas-container" style={{
                    display: "block",
                    width: this.props.width,
                    height: this.props.height,
                    top: 0 - this.props.height,
                    position: "relative",
                    pointerEvents: "none"
                }} >
                    <canvas ref={ this.canvasScatter }
                    width={ this.props.width } height={ this.props.height }
                    style={{}} />
                </div>
                { this.props.after }
            </div>
        );
    }

    public repaint(): void {}

};
