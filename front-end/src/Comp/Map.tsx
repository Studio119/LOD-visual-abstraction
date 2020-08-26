/*
 * @Author: Antoine YANG 
 * @Date: 2020-08-20 22:43:10 
 * @Last Modified by: Antoine YANG
 * @Last Modified time: 2020-08-22 23:17:56
 */

import React, { Component } from "react";
import $ from "jquery";
import MapBox from "../react-mapbox/MapBox";
import { geodata, BinaryTreeNode } from "../types";
import axios, { AxiosResponse } from "axios";
import encodePath from "../Tools/pathEncoder";
import Color from "../Design/Color";
import { Progress } from "../Subcomp/Progress";
import { HilbertEncode, HilbertDecode, HilbertDecodeValidArea } from "../Tools/hilbertEncoder";


const colorize = (val: number) => {
    return Color.toRgb(`hsl(${ 120 + val * 240 },1,${ 0.2 + 0.8 * val })`)
};

export interface MapProps {
    id: string;
    width: number;
    height: number;
};

export interface MapState {
    data: Array<geodata>;
    mode: "scatter" | "node";
};

type InteractionMode = "map" | "sketch";

type InteractionState<T extends InteractionMode> = {
    type: T;
    active: boolean;
    data: {
        current?: Array<[number, number]>;
    };
};

export class Map extends Component<MapProps, MapState, {}> {

    protected map: React.RefObject<MapBox>;

    protected canvasScatter: React.RefObject<HTMLCanvasElement>;
    protected ctxScatter: CanvasRenderingContext2D | null;

    protected canvasSketch: React.RefObject<HTMLCanvasElement>;
    protected ctxSketch: CanvasRenderingContext2D | null;

    protected progress: React.RefObject<Progress>;

    protected timers: Array<NodeJS.Timeout>;
    protected updated: boolean;

    protected interactionState: InteractionState<InteractionMode>;
    protected nodes: Array<HilbertNode>;
    protected nodeR: number;
    protected nodeMax: number;

    public constructor(props: MapProps) {
        super(props);
        this.state = {
            data: [],
            mode: "node"
        };

        this.map = React.createRef<MapBox>();
        this.canvasScatter = React.createRef<HTMLCanvasElement>();
        this.ctxScatter = null;
        this.canvasSketch = React.createRef<HTMLCanvasElement>();
        this.ctxSketch = null;

        this.progress = React.createRef<Progress>();

        this.timers = [];
        this.updated = true;

        this.interactionState = {
            type: "map",
            active: false,
            data: {}
        };

        this.nodes = [];
        this.nodeR = NaN;
        this.nodeMax = NaN;
    }

    public render(): JSX.Element {
        return (
            <div>
                <div key="tools" style={{
                    display: "flex",
                    width: this.props.width - 18,
                    border: "1px solid rgb(28,28,28)",
                    padding: "5.5px 8px 6.5px",
                    textAlign: "left",
                    backgroundColor: "rgb(250,246,248)",
                    fontSize: "14px",
                    letterSpacing: "-0.2px"
                }} >
                    <label key="refresh" title="refresh" style={{
                        display: "inline-block",
                        width: "10px",
                        height: "23px",
                        boxShadow: "2px 2px 2px #00000060",
                        border: "1px solid #ddd",
                        cursor: "pointer"
                    }} onClick={
                        () => {
                            this.repaint();
                        }
                    } />
                    <label key="modeSwitch" title="display mode" style={{
                        display: "inline-block",
                        width: "64px",
                        height: "18px",
                        padding: "3.5px 4px 1.5px",
                        boxShadow: "2px 2px 2px #00000060",
                        textAlign: "center",
                        border: "1px solid #ddd",
                        cursor: "pointer"
                    }} onClick={
                        () => {
                            if (this.state.mode === "node") {
                                this.setState({
                                    mode: "scatter"
                                });
                            } else if (this.state.mode === "scatter") {
                                this.setState({
                                    mode: "node"
                                });
                            }
                        }
                    } >
                        { this.state.mode }
                    </label>
                    <label key="rebuild" title="rebuild Hilbert tree" style={{
                        display: "inline-block",
                        width: "64px",
                        height: "18px",
                        padding: "3.5px 4px 1.5px",
                        boxShadow: "2px 2px 2px #00000060",
                        textAlign: "center",
                        border: "1px solid #ddd",
                        cursor: "pointer",
                        opacity: this.state.mode === "node" ? 1 : 0.4
                    }} onClick={
                        () => {
                            if (this.state.mode !== "node") {
                                return;
                            }
                            this.rebuildTree();
                        }
                    } >
                        { "rebuild" }
                    </label>
                    <img key="sketch" alt="sketch"
                    src={ `/images/sketch${ this.interactionState.type === "sketch" ? "_active" : "" }.jpg` }
                    width="23px" height="21px" style={{
                        boxShadow: "2px 2px 2px #00000060",
                        border: "1px solid #ddd",
                        padding: "1px",
                        cursor: "pointer",
                        opacity: this.state.mode === "node" ? 1 : 0.4
                    }} onClick={
                        () => {
                            if (this.state.mode !== "node") {
                                return;
                            }
                            if (this.interactionState.type === "sketch") {
                                this.setInteractionMode("map");
                            } else {
                                this.setInteractionMode("sketch");
                            }
                        }
                    } />
                    <label key="prun" title="prun Hilbert tree" style={{
                        display: "inline-block",
                        width: "48px",
                        height: "18px",
                        padding: "3.5px 4px 1.5px",
                        boxShadow: "2px 2px 2px #00000060",
                        textAlign: "center",
                        border: "1px solid #ddd",
                        cursor: "pointer",
                        opacity: this.state.mode === "node" ? 1 : 0.4
                    }} onClick={
                        () => {
                            if (this.state.mode !== "node") {
                                return;
                            }
                            if (this.map.current) {
                                this.nodes = prun(geolist2tree(
                                    this.state.data,
                                    10 + this.map.current.getZoom() * 2
                                ));
                                this.repaint();
                            }
                        }
                    } >
                        { "prun" }
                    </label>
                </div>
                <div key="mapbox-container" id={ this.props.id } style={{
                    display: "block",
                    width: this.props.width,
                    height: this.props.height,
                    backgroundColor: "rgb(27,27,27)"
                }} >
                    <MapBox ref={ this.map } containerID={ this.props.id }
                    accessToken="pk.eyJ1IjoiaWNoZW4tYW50b2luZSIsImEiOiJjazF5bDh5eWUwZ2tiM2NsaXQ3bnFvNGJ1In0.sFDwirFIqR4UEjFQoKB8uA"
                    center={ [-0.1132, 51.4936] } zoom={ 9.2 } allowInteraction={ true }
                    styleURL="mapbox://styles/ichen-antoine/cke5cvr811xb419mi5hd9otc3"
                    minZoom={ 1 } maxZoom={ 15 }
                    onBoundsChanged={ () => {
                        this.nodeR = NaN;
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
                <div key="sketch-container" style={{
                    display: "block",
                    width: this.props.width,
                    height: this.props.height,
                    top: 0 - this.props.height * 2,
                    position: "relative",
                    pointerEvents: "none"
                }} >
                    <canvas ref={ this.canvasSketch }
                    width={ this.props.width } height={ this.props.height }
                    style={{
                        display: this.interactionState.type === "sketch" ? undefined : "none",
                        pointerEvents: "all"
                    }}
                    onMouseDown={
                        e => {
                            this.interactionState.active = true;
                            this.interactionState.data = {
                                current: [
                                    [e.clientX, e.clientY - 36.6]
                                ]
                            };
                        }
                    }
                    onMouseMove={
                        e => {
                            if (this.interactionState.active) {
                                const p: [number, number] = [e.clientX, e.clientY - 36.6];
                                const dist_2: number = Math.pow(
                                    this.interactionState.data.current![
                                        this.interactionState.data.current!.length - 1
                                    ][0] - p[0], 2
                                ) + Math.pow(
                                    this.interactionState.data.current![
                                        this.interactionState.data.current!.length - 1
                                    ][1] - p[1], 2
                                );
                                if (dist_2 >= 36) {
                                    this.interactionState.data.current!.push(p);
                                }
                                this.drawSketch();
                            }
                        }
                    }
                    onMouseUp={
                        e => {
                            if (this.interactionState.active && this.interactionState.data?.current!.length) {
                                this.interactionState.active = false;
                                this.interactionState.data.current!.push([e.clientX, e.clientY - 36.6]);
                                this.drawSketch();
                            }
                        }
                    } />
                </div>
                <Progress ref={ this.progress }
                width={ this.props.width * 0.6 } height={ 18 }
                padding={ [0, 0] } hideAfterCompleted={ true }
                styleContainer={{
                    top: this.props.height * 0.92 - 9,
                    left: this.props.width * 0.2
                }} />
            </div>
        );
    }

    public componentDidMount(): void {
        this.ctxScatter = this.canvasScatter.current!.getContext("2d");
        this.ctxSketch = this.canvasSketch.current!.getContext("2d");

        axios.get(
            `/local_file/${ encodePath("../Locale/Occupation.json") }`
        ).then((res: AxiosResponse<Array<{
            id: number;
            lng: number;
            lat: number;
            value: number;
        }>>) => {
            this.load(res.data);
        }).catch(reason => {
            console.error(reason);
        });
    }

    public setInteractionMode(mode: InteractionMode): void {
        if (this.interactionState.type === mode) {
            return;
        }

        this.canvasSketch.current!.width = this.canvasSketch.current!.width;
        
        if (this.interactionState.type === "sketch") {
            $("img[alt=sketch]").attr("src", "/images/sketch.jpg");
            $(this.canvasSketch.current!).hide();
        }

        this.interactionState = {
            type: mode,
            active: false,
            data: {}
        };

        if (mode === "sketch") {
            $("img[alt=sketch]").attr("src", "/images/sketch_active.jpg");
            $(this.canvasSketch.current!).show();
        }
    }

    /**
     * 调用这个方法来基于地图缩放级重置树结构.
     *
     * @protected
     * @memberof Map
     */
    protected rebuildTree(): void {
        if (this.map.current) {
            this.nodeR = NaN;
            this.nodeMax = NaN;
            this.nodes = getHilbertLeaves(
                this.state.data,
                Math.round(10 + this.map.current.getZoom() * 2)
            );
            this.repaint();
        }
    }

    /**
     * 加载未编码的 geodata 数据.
     *
     * @param {Array<{
     *         id: number;
     *         lng: number;
     *         lat: number;
     *         value: number;
     *     }>} data 缺少编码的 geodata 数据
     * @memberof Map
     */
    public load(data: Array<{
        id: number;
        lng: number;
        lat: number;
        value: number;
    }>): void {
        const dl: Array<geodata> = data.map(d => {
            return {
                ...d,
                hilbertCode: HilbertEncode(d.lng, d.lat, 20)
            };
        }).sort((a, b) => a.hilbertCode > b.hilbertCode ? 1 : -1);

        this.setState({
            data: dl
        });
    }

    /**
     * 显示正在进行的手绘操作.
     * 当操作结束时，更新树结构.
     *
     * @protected
     * @returns {void}
     * @memberof Map
     */
    protected drawSketch(): void {
        if (!this.ctxSketch || this.interactionState.data?.current!.length < 2) return;

        let points: Array<[number, number]> = (this.interactionState.data.current as Array<[number, number]>).map(d => d);

        this.canvasSketch.current!.width = this.canvasSketch.current!.width;

        this.ctxSketch.strokeStyle = "rgb(251,126,7)";
        this.ctxSketch.lineWidth = 2;

        points.forEach((p, i) => {
            if (i === 0) {
                this.ctxSketch!.moveTo(p[0], p[1]);
            } else {
                this.ctxSketch!.lineTo(p[0], p[1]);
            }
        });

        if (this.interactionState.active) {
            this.ctxSketch.stroke();
        } else {
            this.ctxSketch.fillStyle = "rgba(251,126,7,0.2)";
            this.ctxSketch.fill();
            this.ctxSketch.closePath();
            this.ctxSketch.stroke();

            if (this.state.mode === "node") {
                setTimeout(() => {
                    // 检查框选中的点
                    let curPoints: Array<HilbertNode> = [];
                    let nextGroup: Array<HilbertNode> = [];
                    
                    this.nodes.forEach(d => {
                        const { lng, lat } = HilbertDecode(d.code);
                        const p: { x: number; y: number; } = this.map.current!.project([lng, lat]);
                        if (
                            p.x < 0 - 2
                            || p.x >= this.props.width + 2
                            || p.y < 0 - 2
                            || p.y >= this.props.height + 2
                        ) {
                            nextGroup.push(d);
                            return;
                        }
        
                        let color: Uint8ClampedArray = this.ctxSketch!.getImageData(p.x, p.y, 1, 1).data;
        
                        if (color[3]) {
                            curPoints.push(d);
                        } else {
                            nextGroup.push(d);
                        }
                    });
        
                    if (curPoints.length) {
                        this.nodes = nextGroup.map(d => d);

                        let curNode: HilbertNode = {
                            code: "",
                            points: [],
                            childrens: []
                        };

                        let x: number = 0;
                        let y: number = 0;

                        curPoints.forEach(d => {
                            d.points.forEach(p => {
                                x += p.lng;
                                y += p.lat;
                            });
                            curNode.points.push(...d.points);
                            curNode.childrens.push(...d.childrens);
                        });

                        x /= curNode.points.length;
                        y /= curNode.points.length;

                        curNode.code = HilbertEncode(x, y, 20);

                        this.nodes = [curNode, ...this.nodes];
        
                        this.ctxScatter!.clearRect(0, 0, this.props.width, this.props.height);
                        this.ctxSketch!.clearRect(0, 0, this.props.width, this.props.height);
                        // 绘制结点
                        this.paintNodes();
                    }
                }, 100);
            }
        }
    }

    public componentWillUnmount(): void {
        this.clearTimers();
    }

    public componentDidUpdate(): void {
        this.rebuildTree();
        this.repaint();
    }

    protected clearTimers(): void {
        this.progress.current?.close();
        this.timers.forEach(timer => {
            clearTimeout(timer);
        });
        this.timers = [];
    }

    /**
     * 绘制散点.
     *
     * @protected
     * @param {Array<{x: number; y:number; val: number;}>} list
     * @param {number} [step=100]
     * @returns {void}
     * @memberof Map
     */
    protected bufferPaintScatters(list: Array<{x: number; y:number; val: number;}>, step: number = 100): void {
        if (!this.ctxScatter) return;

        let piece: Array<{x: number; y:number; val: number;}> = [];

        const r: number = 3;

        const paint = () => {
            const pieceCopy: Array<{x: number; y:number; val: number;}> = piece.map(d => d);
            this.timers.push(
                setTimeout(() => {
                    this.updated = true;

                    pieceCopy.forEach(d => {
                        const degree: number = Math.floor(d.val * 10) / 10;
                        this.ctxScatter!.fillStyle = colorize(degree);
                        this.ctxScatter!.beginPath();
                        this.ctxScatter!.arc(
                            d.x, d.y, r, 0, 2 * Math.PI
                        );
                        this.ctxScatter!.fill();
                        this.ctxScatter!.closePath();
                    });

                    this.progress.current?.next();
                }, 1 * this.timers.length)
            );
            piece = [];
        };

        list.forEach(d => {
            if (
                d.x < 0 - r / 2
                || d.x >= this.props.width + r / 2
                || d.y < 0 - r / 2
                || d.y >= this.props.height + r / 2
            ) return;
            piece.push(d);
            if (piece.length === step) {
                paint();
            }
        });

        if (piece.length) {
            paint();
        }

        this.progress.current?.start(this.timers.length);
    }
    
    /**
     * 重绘数据，内部封装绘制模式的分支.
     *
     * @param {boolean} [waiting=true]
     * @returns {void}
     * @memberof Map
     */
    public repaint(waiting: boolean = true): void {
        if (waiting) {
            if (this.ctxScatter) {
                this.ctxScatter.clearRect(0, 0, this.props.width, this.props.height);
            }
            this.updated = false;
        }
        if (this.updated) {
            return;
        }
        this.clearTimers();
        if (this.map.current) {
            if (!this.map.current!.ready()) {
                this.updated = false;
                setTimeout(() => {
                    this.repaint(false);
                }, 200);
                return;
            }
            if (this.state.mode === "scatter") {
                // 绘制散点图
                let renderingQueue: Array<{x: number; y:number; val: number;}> = [];
                this.state.data.forEach((d: geodata) => {
                    renderingQueue.push({
                        ...this.map.current!.project(d),
                        val: d.value
                    })
                });
                this.bufferPaintScatters(renderingQueue);
            } else if (this.state.mode === "node") {
                // 绘制结点
                this.paintNodes();
            }
        }
    }

    /**
     * 绘制结点.
     *
     * @protected
     * @returns {void}
     * @memberof Map
     */
    protected paintNodes(): void {
        if (!this.ctxScatter) return;

        this.updated = true;

        if (isNaN(this.nodeR)) {
            // 重置后，根据预测推荐一个半径参数
            let box: Array<{ x: number; y: number; }> = [];

            this.nodeR = this.map.current!.getZoom() / 3 + 3;
                
            this.nodes.forEach(node => {
                const pos: {
                    x: number;
                    y: number;
                } = this.map.current!.project(HilbertDecode(node.code));

                box.push(pos);
            });

            box = box.sort((a, b) => a.y - b.y);

            for (let i: number = 1; i < box.length; i++) {
                if (box[i].y - box[i - 1].y < 1e-6) {
                    continue;
                }
                this.nodeR = Math.min(
                    this.nodeR,
                    box[i].y - box[i - 1].y
                );
            }

            box.sort((a, b) => a.x - b.x);

            for (let i: number = 1; i < box.length; i++) {
                if (box[i].x - box[i - 1].x < 1e-6) {
                    continue;
                }
                this.nodeR = Math.min(
                    this.nodeR,
                    box[i].x - box[i - 1].x
                );
            }

            this.nodeR = (this.nodeR - 0.5) * 0.8;

            this.nodeMax = Math.max(...this.nodes.map(
                d => d.points.length / d.childrens.length
            ));
        }

        const proj = (num: number) => Math.sqrt(num / this.nodeMax) * (this.nodeR - 1) + 1;
        
        this.nodes.forEach(node => {
            let s: number = 0;

            node.points.forEach(p => {
                s += p.value;
            });
            
            s = Math.floor(s / node.points.length * 10) / 10;

            const pos: {
                x: number;
                y: number;
            } = this.map.current!.project(HilbertDecode(node.code));

            if (
                pos.x < 0 - this.nodeR
                || pos.x >= this.props.width + this.nodeR
                || pos.y < 0 - this.nodeR
                || pos.y >= this.props.height + this.nodeR
            ) {
                return;
            }

            const r: number = proj(node.points.length);

            if (r >= 16) {
                this.renderNode(node, pos.x, pos.y, r);
                return;
            }
            
            const range: {
                lng: [number, number];
                lat: [number, number];
            } = HilbertDecodeValidArea(node.code);
            const l1: { x: number; y: number; } = this.map.current!.project({
                lng: range.lng[0],
                lat: range.lat[0]
            });
            const l2: { x: number; y: number; } = this.map.current!.project({
                lng: range.lng[1],
                lat: range.lat[1]
            });

            this.timers.push(
                setTimeout(() => {
                    this.ctxScatter!.strokeStyle = colorize(s);
                    this.ctxScatter!.lineWidth = 1;
                    this.ctxScatter!.strokeRect(
                        Math.min(l1.x, l2.x),
                        Math.min(l1.y, l2.y),
                        Math.abs(l2.x - l1.x),
                        Math.abs(l2.y - l1.y)
                    );

                    this.ctxScatter!.fillStyle = colorize(s);
                    this.ctxScatter!.beginPath();
                    this.ctxScatter!.arc(
                        pos.x, pos.y, r, 0, 2 * Math.PI
                    );
                    this.ctxScatter!.fill();
                    this.ctxScatter!.closePath();

                    this.progress.current?.next();
                }, 0.02 * this.timers.length + 20)
            );
        });

        this.progress.current?.start(this.timers.length);
    }

    /**
     * 展开绘制单个结点.
     *
     * @param {HilbertNode} node 目标展示结点
     * @param {number} x x坐标
     * @param {number} y y坐标
     * @param {number} r 原始半径
     * @protected
     * @memberof Map
     */
    protected renderNode(node: HilbertNode, x: number, y: number, r: number): void {
        /** 绘制图形的外边长 */
        const a: number = Math.sqrt(Math.PI * r * r);
        /** 绘制图形的外角半径 */
        const br: number = 1 + Math.pow(a, 0.25);
        /** 绘制图形的内边长 */
        const b: number = a - br * 2;
        
        /** 柱形的数量 */
        const nColumns: number = 4 + Math.min(Math.floor(a / 12) * 2, 12);
        /** 单个柱形的宽度 */
        const w: number = b / nColumns;

        let box: Array<number> = new Array<number>(nColumns).fill(0);

        node.points.forEach(p => {
            const idx: number = Math.floor(p.value * nColumns);
            box[idx] += 1 / node.points.length;
        });

        /** y 轴的最大值 */
        const max: number = Math.min(1, Math.max(...box) * 1.25);
        const fy = (val: number) => (b * val / max);

        // 底部
        this.ctxScatter!.strokeStyle = "rgb(17,17,17)";
        this.ctxScatter!.fillStyle = "rgb(255,255,255)";
        this.ctxScatter!.lineWidth = 1;
        this.ctxScatter!.globalAlpha = 0.3;
        this.ctxScatter!.beginPath();
        this.ctxScatter!.moveTo(x - a / 2 + br, y - a / 2);
        this.ctxScatter!.lineTo(x + a / 2 - br, y - a / 2);
        this.ctxScatter!.arcTo(x + a / 2, y - a / 2, x + a / 2, y - a / 2 + br, br);
        this.ctxScatter!.lineTo(x + a / 2, y + a / 2 - br);
        this.ctxScatter!.arcTo(x + a / 2, y + a / 2, x + a / 2 - br, y + a / 2, br);
        this.ctxScatter!.lineTo(x - a / 2 + br, y + a / 2);
        this.ctxScatter!.arcTo(x - a / 2, y + a / 2, x - a / 2, y + a / 2 - br, br);
        this.ctxScatter!.lineTo(x - a / 2, y - a / 2 + br);
        this.ctxScatter!.arcTo(x - a / 2, y - a / 2, x - a / 2 + br, y - a / 2, br);
        this.ctxScatter!.fill();
        this.ctxScatter!.stroke();

        // 内部
        this.ctxScatter!.strokeStyle = "rgb(22,22,22)";
        this.ctxScatter!.lineWidth = 1;
        this.ctxScatter!.globalAlpha = 0.6;
        this.ctxScatter!.beginPath();
        this.ctxScatter!.moveTo(x - b / 2, y - b / 2);
        this.ctxScatter!.lineTo(x + b / 2, y - b / 2);
        this.ctxScatter!.lineTo(x + b / 2, y + b / 2);
        this.ctxScatter!.lineTo(x - b / 2, y + b / 2);
        this.ctxScatter!.closePath();
        this.ctxScatter!.fill();
        this.ctxScatter!.stroke();

        // 条形
        this.ctxScatter!.globalAlpha = 1;
        this.ctxScatter!.strokeStyle = "rgb(34,34,34)";
        box.forEach((col, i) => {
            this.ctxScatter!.fillStyle = colorize(i / nColumns);
            this.ctxScatter!.fillRect(x - b / 2 + w * i, y + b / 2 - fy(col), w, fy(col));
            this.ctxScatter!.strokeRect(x - b / 2 + w * i, y + b / 2 - fy(col), w, fy(col));
        });
    }

};

type HilbertNode = {
    code: string;
    points: Array<geodata>;
    childrens: Array<{
        lng: [number, number];
        lat: [number, number];
    }>;
};

type HilbertTreeNode = BinaryTreeNode<{
    code: string;
    points?: Array<geodata>;
    childrens?: Array<{
        lng: [number, number];
        lat: [number, number];
    }>;
}>;

/**
 * 查找列表中存在于指定 Hilbert 节点的数据.
 *
 * @param {Array<geodata>} data
 * @param {string} code
 * @returns {Array<geodata>}
 */
const getNode = (data: Array<geodata>, code: string): Array<geodata> => {
    let result: Array<geodata> = [];

    data.forEach(d => {
        if (d.hilbertCode.startsWith(code)) {
            result.push(d);
        }
    });

    return result;
};

/**
 * 将已经编码完成的数据转化为树结构.
 *
 * @param {Array<geodata>} data 数据列表
 * @param {string} [rootCode=""] 根节点编码
 * @param {number} [depth=0] 最大深度，默认为编码精度
 * @returns {HilbertTreeNode}
 */
 export const geolist2tree = (data: Array<geodata>, depth: number = 0, rootCode: string = ""): HilbertTreeNode => {
    let root: HilbertTreeNode = {
        parent: null,
        leftChild: null,
        rightChild: null,
        data: {
            code: rootCode
        }
    };

    if (data.length) {
        if (depth === 0) {
            depth = data[0].hilbertCode.length;
        }
        
        if (rootCode.length > depth) {
            // 到达最大精度
            root.data.points = data.map(d => d);
            return root;
        }
        let leftPoints: Array<geodata> = getNode(data, rootCode + "0");
        let rightPoints: Array<geodata> = getNode(data, rootCode + "1");
        // 获取左节点
        if (leftPoints.length) {
            let leftChild: HilbertTreeNode = geolist2tree(leftPoints, depth, rootCode + "0");
            root.leftChild = leftChild;
            leftChild.parent = root;
        }
        // 获取右节点
        if (rightPoints.length) {
            let rightChild: HilbertTreeNode = geolist2tree(rightPoints, depth, rootCode + "1");
            root.rightChild = rightChild;
            rightChild.parent = root;
        }
    } else {
        root.data.points = [];
    }

    return root;
};

/**
 * 遍历一个结点下的子树.
 *
 * @param {HilbertTreeNode} root
 * @param {((node: HilbertTreeNode) => (void | undefined))} callback
 */
const eachHilbertNodes = (root: HilbertTreeNode, callback: (node: HilbertTreeNode) => (void | undefined)): void => {
    if (root.leftChild) {
        eachHilbertNodes(root.leftChild, callback);
    }
    if (root.rightChild) {
        eachHilbertNodes(root.rightChild, callback);
    }
    callback(root);
};

/**
 * 获取已经编码完成的数据的叶子结点集合.
 *
 * @param {Array<geodata>} data 数据列表
 * @param {string} [rootCode=""] 根节点编码
 * @param {number} [depth=0] 最大深度，默认为编码精度
 * @returns {Array<HilbertNode>} 需要绘制的结点
 */
 const getHilbertLeaves = (data: Array<geodata>, depth: number = 0, rootCode: string = ""): Array<HilbertNode> => {
    let list: Array<HilbertNode> = [];

    if (data.length) {
        if (depth === 0) {
            depth = data[0].hilbertCode.length;
        }
        
        if (rootCode.length + 1 >= depth) {
            // 到达最大精度，绘制叶子节点
            const range: {
                lng: [number, number];
                lat: [number, number];
            } = HilbertDecodeValidArea(rootCode);

            range.lng.sort((a, b) => a - b);
            range.lat.sort((a, b) => a - b);

            return [{
                code: rootCode,
                points: data.map(d => d),
                childrens: [{
                    lng: range.lng,
                    lat: range.lat
                }]
            }];
        }
        let leftPoints: Array<geodata> = getNode(data, rootCode + "0");
        let rightPoints: Array<geodata> = getNode(data, rootCode + "1");
        // 遍历左节点
        if (leftPoints.length) {
            list.push(...getHilbertLeaves(leftPoints, depth, rootCode + "0"));
        }
        // 遍历右节点
        if (rightPoints.length) {
            list.push(...getHilbertLeaves(rightPoints, depth, rootCode + "1"));
        }
    }

    if (list.length) {
        return list.map(d => d);
    } else {
        const range: {
            lng: [number, number];
            lat: [number, number];
        } = HilbertDecodeValidArea(rootCode);
        range.lng.sort((a, b) => a - b);
        range.lat.sort((a, b) => a - b);

        return [{
            code: rootCode,
            points: data.map(d => d),
            childrens: [{
                lng: range.lng,
                lat: range.lat
            }]
        }];
    }
};

/**
 * 对树结构进行剪枝.
 *
 * @param {HilbertTreeNode} tree 原始树结构
 * @returns {Array<HilbertNode>}
 */
const prun = (tree: HilbertTreeNode): Array<HilbertNode> => {
    let root: HilbertTreeNode = tree;

    eachHilbertNodes(root, node => {
        let temp: HilbertTreeNode | null = node.leftChild;
        if (node.leftChild && !node.rightChild) {
            // 只有左
        } else if (!node.leftChild && node.rightChild) {
            // 只有右
            temp = node.rightChild;
        } else {
            if (!node.leftChild && !node.rightChild && node.data.points) {
                // 重定位
                let lng: number = 0;
                let lat: number = 0;

                node.data.points.forEach(p => {
                    lng += p.lng;
                    lat += p.lat;
                });

                lng /= node.data.points.length;
                lat /= node.data.points.length;

                let childrens: Array<{
                    lng: [number, number];
                    lat: [number, number];
                }> = [];

                eachHilbertNodes(node, n => {
                    if (!node.leftChild && !node.rightChild) {
                        const range: {
                            lng: [number, number];
                            lat: [number, number];
                        } = HilbertDecodeValidArea(n.data.code);
            
                        range.lng.sort((a, b) => a - b);
                        range.lat.sort((a, b) => a - b);

                        childrens.push({
                            lng: range.lng,
                            lat: range.lat
                        });
                    }
                });

                if (childrens.length === 0) {
                    const range: {
                        lng: [number, number];
                        lat: [number, number];
                    } = HilbertDecodeValidArea(node.data.code);
        
                    range.lng.sort((a, b) => a - b);
                    range.lat.sort((a, b) => a - b);

                    childrens.push({
                        lng: range.lng,
                        lat: range.lat
                    });
                }

                node.data = {
                    code: HilbertEncode(lng, lat, 20),
                    points: node.data.points,
                    childrens: childrens
                };
            }

            return;
        }
        if (temp && temp.data.points) {
            // 收缩
            let lng: number = 0;
            let lat: number = 0;
            let points: Array<geodata> = [];

            temp.data.points.forEach(p => {
                lng += p.lng;
                lat += p.lat;
                points.push(p);
            });

            lng /= points.length;
            lat /= points.length;

            let childrens: Array<{
                lng: [number, number];
                lat: [number, number];
            }> = [];

            eachHilbertNodes(node, n => {
                if (!node.leftChild && !node.rightChild) {
                    const range: {
                        lng: [number, number];
                        lat: [number, number];
                    } = HilbertDecodeValidArea(n.data.code);
        
                    range.lng.sort((a, b) => a - b);
                    range.lat.sort((a, b) => a - b);

                    childrens.push({
                        lng: range.lng,
                        lat: range.lat
                    });
                }
            });

            if (childrens.length === 0) {
                const range: {
                    lng: [number, number];
                    lat: [number, number];
                } = HilbertDecodeValidArea(node.data.code);
    
                range.lng.sort((a, b) => a - b);
                range.lat.sort((a, b) => a - b);

                childrens.push({
                    lng: range.lng,
                    lat: range.lat
                });
            }

            node.data = {
                code: HilbertEncode(lng, lat, 20),
                points: points,
                childrens: childrens
            };
            node.leftChild = null;
            node.rightChild = null;
        }
    });

    eachHilbertNodes(root, node => {
        if (!node.parent) {
            // 是根节点
            return;
        }
        if (node.leftChild || node.rightChild) {
            // 不是叶子节点
            return;
        }
        let sibling: HilbertTreeNode | null = node.parent.rightChild;
        if (node.parent.leftChild === node) {
            // 作为左子节点
            if (!node.parent.rightChild?.data.points) {
                // 没有同胞结点或同胞结点不是叶子节点
                return;
            }
        } else {
            // 作为右子节点
            if (!node.parent.leftChild?.data.points) {
                // 没有同胞结点或同胞结点不是叶子节点
                return;
            } else {
                sibling = node.parent.leftChild;
            }
        }
        
        let valueLeft: number = 0;
        let valueRight: number = 0;

        node.data.points!.forEach(p => {
            valueLeft += p.value;
        });
        valueLeft /= node.data.points!.length;

        sibling!.data.points!.forEach(p => {
            valueRight += p.value;
        });
        valueRight /= sibling!.data.points!.length;

        if (Math.abs(valueLeft - valueRight) < 0.05) {
            let lng: number = 0;
            let lat: number = 0;

            node.data.points!.forEach(p => {
                lat += p.lat;
                lng += p.lng;
            });
            sibling!.data.points!.forEach(p => {
                lat += p.lat;
                lng += p.lng;
            });

            lng /= (
                node.data.points!.length + sibling!.data.points!.length
            );
            lat /= (
                node.data.points!.length + sibling!.data.points!.length
            );

            node.parent.data = {
                code: HilbertEncode(lng, lat, 20),
                points: node.data.points!.concat(
                    sibling!.data.points!
                ),
                childrens: node.data.childrens!.concat(sibling!.data.childrens!)
            };
            node.parent.leftChild = null;
            node.parent.rightChild = null;
        }
    });

    let list: Array<HilbertNode> = [];

    eachHilbertNodes(root, node => {
        if (node.leftChild || node.rightChild) {
            return;
        }

        if (node.data.childrens)

        list.push({
            code: node.data.code,
            points: node.data.points!,
            childrens: node.data.childrens || 1
        });
    });

    return list;
};
