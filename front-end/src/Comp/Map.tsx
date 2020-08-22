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
import { HilbertEncode, HilbertDecode } from "../Tools/hilbertEncoder";


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
        groups?: Array<HilbertNode>;
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
    }

    public render(): JSX.Element {
        return (
            <div>
                <div key="tools" style={{
                    display: "flex",
                    width: this.props.width,
                    border: "rgb(28,28,28)",
                    padding: "6px 8px",
                    textAlign: "left"
                }} >
                    <label key="modeSwitch_label" style={{
                        display: "inline-block",
                        height: "18px",
                        padding: "3px 6px 1px",
                        textAlign: "center"
                    }}  >
                        { "Display mode:" }
                    </label>
                    <label key="modeSwitch" style={{
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
                    <img key="sketch" alt="sketch"
                    src={ `/images/sketch${ this.interactionState.type === "sketch" ? "_active" : "" }.jpg` }
                    width="23px" height="23px" style={{
                        marginLeft: "8px",
                        boxShadow: "2px 2px 2px #00000060",
                        border: "1px solid #ddd",
                        cursor: "pointer"
                    }} onClick={
                        () => {
                            if (this.interactionState.type === "sketch") {
                                this.setInteractionMode("map");
                            } else {
                                this.setInteractionMode("sketch");
                            }
                        }
                    } />
                </div>
                <div key="mapbox-container" id={ this.props.id } style={{
                    display: "block",
                    width: this.props.width,
                    height: this.props.height
                }} >
                    <MapBox ref={ this.map } containerID={ this.props.id }
                    accessToken="pk.eyJ1IjoiaWNoZW4tYW50b2luZSIsImEiOiJjazF5bDh5eWUwZ2tiM2NsaXQ3bnFvNGJ1In0.sFDwirFIqR4UEjFQoKB8uA"
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
                                ],
                                groups: this.interactionState.data?.groups || (
                                    getHilbertLeaves(this.state.data, 10 + this.map.current!.getZoom() * 2).map(d => d)
                                )
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

    public load(data: Array<{
        id: number;
        lng: number;
        lat: number;
        value: number;
    }>): void {
        const dl: Array<geodata> = data.map(d => {
            return {
                ...d,
                hilbertCode: HilbertEncode(d.lng, d.lat, 16)
            };
        }).sort((a, b) => a.hilbertCode > b.hilbertCode ? 1 : -1);

        this.setState({
            data: dl
        });
    }

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
                    const group: Array<HilbertNode> = this.interactionState.data.groups!;
                    let nextGroup: Array<HilbertNode> = [];
                    
                    group.forEach(d => {
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
                        this.interactionState.data.groups = nextGroup.map(d => d);

                        let curNode: HilbertNode = {
                            code: "",
                            points: [],
                            childrens: 0
                        };

                        let x: number = 0;
                        let y: number = 0;

                        curPoints.forEach(d => {
                            const { lng, lat } = HilbertDecode(d.code);
                            x += lng;
                            y += lat;
                            curNode.points.push(...d.points);
                            curNode.childrens += d.childrens;
                        });

                        x /= curPoints.length;
                        y /= curPoints.length;

                        curNode.code = HilbertEncode(x, y, 16);

                        this.interactionState.data.groups = [curNode, ...this.interactionState.data.groups];
        
                        this.ctxScatter!.clearRect(0, 0, this.props.width, this.props.height);
                        this.ctxSketch!.clearRect(0, 0, this.props.width, this.props.height);
                        // 绘制结点
                        this.updated = true;
                        this.paintNodes(this.interactionState.data.groups);
                    }
                }, 100);
            }
        }
    }

    public componentWillUnmount(): void {
        this.clearTimers();
    }

    public componentDidUpdate(): void {
        this.repaint();
    }

    protected clearTimers(): void {
        this.progress.current?.close();
        this.timers.forEach(timer => {
            clearTimeout(timer);
        });
        this.timers = [];
    }

    protected bufferPaintScatters(list: Array<{x: number; y:number; val: number;}>, step: number = 100): void {
        this.clearTimers();

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
                const list: Array<HilbertNode> = getHilbertLeaves(this.state.data, 10 + this.map.current.getZoom() * 2);
                this.updated = true;
                this.paintNodes(list);
            }
        }
    }

    /**
     * 绘制结点.
     *
     * @param {Array<HilbertNode>} nodes 结点列表
     */
    protected paintNodes(nodes: Array<HilbertNode>): void {
        this.clearTimers();

        if (!this.ctxScatter) return;

        const max: number = Math.max(...nodes.map(d => d.points.length / d.childrens));

        let r: number = this.map.current!.getZoom() / 3 + 3;

        let box: Array<{ x: number; y: number; }> = [];

        const proj = (num: number) => Math.sqrt(num / max) * (r - 1) + 1;

        nodes.forEach(node => {
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
                pos.x < 0 - r
                || pos.x >= this.props.width + r
                || pos.y < 0 - r
                || pos.y >= this.props.height + r
            ) {
                return;
            }

            box.push(pos);

            this.timers.push(
                setTimeout(() => {
                    this.ctxScatter!.fillStyle = colorize(s);
                    this.ctxScatter!.beginPath();
                    this.ctxScatter!.arc(
                        pos.x, pos.y, proj(node.points.length), 0, 2 * Math.PI
                    );
                    this.ctxScatter!.fill();
                    this.ctxScatter!.closePath();

                    this.progress.current?.next();
                }, 1 * this.timers.length + 20)
            );
        });

        if (box.length > 1) {
            box = box.sort((a, b) => a.y - b.y);
            for (let i: number = 1; i < box.length; i++) {
                if (box[i].y - box[i - 1].y < 1e-6) {
                    continue;
                }
                r = Math.min(
                    r,
                    box[i].y - box[i - 1].y
                );
            }
            box.sort((a, b) => a.x - b.x);
            for (let i: number = 1; i < box.length; i++) {
                if (box[i].x - box[i - 1].x < 1e-6) {
                    continue;
                }
                r = Math.min(
                    r,
                    box[i].x - box[i - 1].x
                );
            }
            r = (r - 0.5) * 0.8;
        }

        this.progress.current?.start(this.timers.length);
    }
};

type HilbertNode = {
    code: string;
    points: Array<geodata>;
    childrens: number;
};

type HilbertTreeNode = BinaryTreeNode<{
    code: string;
    points?: Array<geodata>;
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
        
        if (rootCode.length > depth) {
            // 到达最大精度，绘制叶子节点
            return [...list.map(d => d), {
                code: rootCode,
                points: data.map(d => d),
                childrens: 1
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

    return list.map(d => d);
};
