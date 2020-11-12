/*
 * @Author: Antoine YANG 
 * @Date: 2020-08-20 22:43:10 
 * @Last Modified by: Antoine YANG
 * @Last Modified time: 2020-08-22 23:17:56
 */

import React, { Component } from "react";
// import $ from "jquery";
import MapBox from "../react-mapbox/MapBox";
import { geodata, BinaryTreeNode } from "../types";
import axios, { AxiosResponse } from "axios";
import encodePath from "../Tools/pathEncoder";
import Color from "../Design/Color";
import { Progress } from "../Subcomp/Progress";
import { HilbertEncode, HilbertDecode, HilbertDecodeValidArea } from "../Tools/hilbertEncoder";
import { debounced } from "../Tools/decorator";


const colorize = (val: number) => {
    return Color.toRgb(`hsl(${ 120 + Math.floor(Math.pow(val, 0.7) * 240) },1,0.5)`)
};

export interface MapProps {
    id: string;
    width: number;
    height: number;
};

export interface MapState {
    data: Array<geodata>;
    mode: "scatter" | "node" | "superpixel";
};

export class Map extends Component<MapProps, MapState, {}> {

    protected map: React.RefObject<MapBox>;

    protected canvasScatter: React.RefObject<HTMLCanvasElement>;
    protected ctxScatter: CanvasRenderingContext2D | null;

    protected progress: React.RefObject<Progress>;

    protected timers: Array<NodeJS.Timeout>;
    protected updated: boolean;

    protected nodes: Array<HilbertNode>;
    protected nodeMax: number;

    public constructor(props: MapProps) {
        super(props);
        this.state = {
            data: [],
            mode: "superpixel"
        };

        this.repaint = debounced(this.repaint.bind(this));

        this.map = React.createRef<MapBox>();
        this.canvasScatter = React.createRef<HTMLCanvasElement>();
        this.ctxScatter = null;

        this.progress = React.createRef<Progress>();

        this.timers = [];
        this.updated = true;

        this.nodes = [];
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
                        width: "80px",
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
                                    mode: "superpixel"
                                });
                            } else if (this.state.mode === "scatter") {
                                this.setState({
                                    mode: "node"
                                });
                            } else if (this.state.mode === "superpixel") {
                                this.setState({
                                    mode: "scatter"
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

    /**
     * 调用这个方法来基于地图缩放级重置树结构.
     *
     * @protected
     * @memberof Map
     */
    protected rebuildTree(): void {
        if (this.map.current) {
            this.nodeMax = NaN;
            this.nodes = getHilbertLeaves(
                this.state.data,
                Math.round(this.map.current.getZoom() * 4 - 5)
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
                        this.ctxScatter!.fillStyle = colorize(d.val);
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
            } else if (this.state.mode === "superpixel") {
                this.paintSuperpixel();
            }
        }
    }

    /**
     * 绘制 superpixel.
     *
     * @protected
     * @memberof Map
     */
    protected paintSuperpixel(): void {
        this.clearTimers();
        
        // let piece: Array<{x: number; y:number; val: number;}> = [];

        // const paint = () => {
        //     const pieceCopy: Array<{x: number; y:number; val: number;}> = piece.map(d => d);
        //     this.timers.push(
        //         setTimeout(() => {
        //             this.updated = true;

        //             pieceCopy.forEach(d => {
        //                 this.ctxScatter!.fillStyle = colorize(d.val);
        //                 this.ctxScatter!.beginPath();
        //                 this.ctxScatter!.fillRect(d.x * 2, d.y * 2, 2, 2);
        //                 this.ctxScatter!.fill();
        //                 this.ctxScatter!.closePath();
        //             });

        //             this.progress.current?.next();
        //         }, 1 * this.timers.length)
        //     );
        //     piece = [];
        // };

        let box: Array<Array<Array<number>>> = [];
        let valBox: Array<Array<number>> = [];
        
        for (let y: number = 0; y < this.props.height / 2; y++) {
            box.push([]);
            valBox.push([]);
            for (let x: number = 0; x < this.props.width / 2; x++) {
                box[y].push([]);
                valBox[y].push(0);
            }
        }

        this.state.data.forEach(d => {
            let pos = this.map.current!.project({
                lng: d.lng, lat: d.lat
            });
            pos = {
                x: Math.round(pos.x / 2),
                y: Math.round(pos.y / 2)
            };
            if (pos.x < 0 || pos.x >= this.props.width / 2 || pos.y < 0 || pos.y >= this.props.height / 2) {
                return;
            }
            box[pos.y][pos.x].push(d.value);
        });

        const box2 = this.spread(box);

        for (let y: number = 0; y < this.props.height / 2; y++) {
            for (let x: number = 0; x < this.props.width / 2; x++) {
                if (box2[y][x].length > 0) {
                    let val: number = 0;
                    box2[y][x].forEach(d => val += d);
                    valBox[y][x] = val / box2[y][x].length;
                }
            }
        }

        // for (let y: number = 0; y < this.props.height / 2; y++) {
        //     for (let x: number = 0; x < this.props.width / 2; x++) {
        //         const val = valBox[y][x];
        //         if (val > 0) {
        //             piece.push({ x, y, val });
        //             if (piece.length === 100) {
        //                 paint();
        //             }
        //         }
        //     }
        // }

        // if (piece.length) {
        //     paint();
        // }

        const superPixels = this.getSuperPixel(valBox, 6);

        SuperPixel.grow();

        superPixels.forEach(sp => {
            this.timers.push(
                setTimeout(() => {
                    // this.ctxScatter!.strokeStyle = "rgb(249,95,24)";
                    this.ctxScatter!.strokeStyle = "rgba(0,0,0,0.5)";
                    this.ctxScatter!.lineWidth = 1;
                    this.ctxScatter!.fillStyle = colorize(sp.value);

                    sp.children.forEach(child => {
                        this.ctxScatter!.fillRect(
                            child[0] * 2, child[1] * 2, 2, 2
                        );
                    });
                    
                    // sp.getBorders().forEach(line => {
                    //     this.ctxScatter!.beginPath();
                    //     this.ctxScatter!.moveTo(
                    //         Math.round(line.x1 / 2) * 2 + 1, 
                    //         Math.round(line.y1 / 2) * 2 + 1
                    //     );
                    //     this.ctxScatter!.lineTo(
                    //         Math.round(line.x2 / 2) * 2 + 1, 
                    //         Math.round(line.y2 / 2) * 2 + 1
                    //     );
                    //     this.ctxScatter!.stroke();
                    //     this.ctxScatter!.closePath();
                    // });

                    this.progress.current!.next();
                }, 1 * this.timers.length)
            );
        });

        this.progress.current?.start(this.timers.length);
    }

    protected spread(box: number[][][], radius: number = 9): number[][][] {
        let box2: Array<Array<Array<number>>> = [];
        
        for (let y: number = 0; y < this.props.height; y++) {
            box2.push([]);
            for (let x: number = 0; x < this.props.width; x++) {
                box2[y].push([]);
            }
        }
        
        let core: number[][] = [];
        let sumW: number = 0;

        for (let y: number = 0; y < radius * 2 + 1; y++) {
            core.push([]);
            for (let x: number = 0; x < radius * 2 + 1; x++) {
                const weight = 1 / Math.sqrt(
                    (Math.pow(y - radius, 2) + Math.pow(x - radius, 2)) || Infinity
                );
                sumW += weight;
                core[y].push(weight);
            }
        }
        
        for (let y: number = 0; y < radius * 2 + 1; y++) {
            for (let x: number = 0; x < radius * 2 + 1; x++) {
                core[y][x] /= sumW;
            }
        }

        for (let y: number = 0; y < this.props.height; y++) {
            for (let x: number = 0; x < this.props.width; x++) {
                try {
                    if (box[y][x].length) {
                        let value: number = 0;
                        box[y][x].forEach(d => {
                            value += d;
                        });
                        box2[y][x] = [value / box[y][x].length];
                        continue;
                    }
                } catch {
                    break;
                }
                let value: number = 0;
                let weights: number = 0;
                for (let dy: number = 0; dy < radius * 2 + 1; dy++) {
                    for (let dx: number = 0; dx < radius * 2 + 1; dx++) {
                        if (Math.pow(dy - radius, 2) + Math.pow(dx - radius, 2) > Math.pow(radius, 2)) {
                            continue;
                        }
                        const oy: number = y - radius + dy;
                        if (oy < 0 || oy >= this.props.height / 2) {
                            continue;
                        }
                        const ox: number = x - radius + dx;
                        if (ox < 0 || ox >= this.props.width / 2) {
                            continue;
                        }
                        if (box[oy][ox].length > 0) {
                            box[oy][ox].forEach(d => {
                                value += d * core[dy][dx];
                                weights += core[dy][dx];
                            });
                        }
                    }
                }
                if (weights) {
                    box2[y][x] = [value / weights];
                }
            }
        }

        return box2;
    }

    protected getSuperPixel(box: Array<Array<number>>, r: number = 8): Array<SuperPixel> {
        SuperPixel.loadArea(box);

        let list: Array<SuperPixel> = [];

        for (let y: number = Math.round(r / 4); y < this.props.height / 2; y += r) {
            for (let x: number = Math.round(r / 4); x < this.props.width / 2; x += r) {
                if (box[y][x] > 0) {
                    list.push(
                        new SuperPixel(x, y)
                    );
                }
            }
        }

        return list;
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

        this.nodeMax = Math.max(...this.nodes.map(
            d => d.points.length / (d.childrens.length || 1)
        ));

        const proj = (num: number) => Math.sqrt(num / this.nodeMax);

        this.timers = [];
        
        this.nodes.forEach(node => {
            let s: number = 0;

            node.points.forEach(p => {
                s += p.value;
            });

            s /= node.points.length;

            if (node.childrens.length > 1) {
                const o: number = proj(node.points.length / node.childrens.length);

                node.childrens.forEach(child => {
                    const range: {
                        lng: [number, number];
                        lat: [number, number];
                    } = HilbertDecodeValidArea(child.code);
                    const l1: { x: number; y: number; } = this.map.current!.project({
                        lng: range.lng[0],
                        lat: range.lat[0]
                    });
                    const l2: { x: number; y: number; } = this.map.current!.project({
                        lng: range.lng[1],
                        lat: range.lat[1]
                    });

                    if (
                        Math.max(l1.x, l2.x) < 0 || Math.min(l1.x, l2.x) >= this.props.width
                        || Math.max(l1.y, l2.y) < 0 || Math.min(l1.y, l2.y) >= this.props.height) {
                        return;
                    }

                    this.timers.push(
                        setTimeout(() => {
                            const sl: string = colorize(s);
                            const ol: number = 0.1 + 0.9 * o;
                            this.ctxScatter!.fillStyle = sl;
                            this.ctxScatter!.lineWidth = 4;
                            this.ctxScatter!.strokeStyle = "white";
                            this.ctxScatter!.globalAlpha = 1;
                            this.ctxScatter!.strokeRect(
                                Math.min(l1.x, l2.x),
                                Math.min(l1.y, l2.y),
                                Math.abs(l2.x - l1.x),
                                Math.abs(l2.y - l1.y)
                            );
                            setTimeout(() => {
                                this.ctxScatter!.globalAlpha = ol;
                                this.ctxScatter!.fillStyle = sl;
                                this.ctxScatter!.clearRect(
                                    Math.min(l1.x, l2.x),
                                    Math.min(l1.y, l2.y),
                                    Math.abs(l2.x - l1.x),
                                    Math.abs(l2.y - l1.y)
                                );
                                this.ctxScatter!.fillRect(
                                    Math.min(l1.x, l2.x),
                                    Math.min(l1.y, l2.y),
                                    Math.abs(l2.x - l1.x),
                                    Math.abs(l2.y - l1.y)
                                );
                            }, 2);
        
                            this.progress.current?.next();
                            this.ctxScatter!.globalAlpha = 1;
                        }, 0.02 * this.timers.length + 20)
                    );
                });

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

            if (
                Math.max(l1.x, l2.x) < 0 || Math.min(l1.x, l2.x) >= this.props.width
                || Math.max(l1.y, l2.y) < 0 || Math.min(l1.y, l2.y) >= this.props.height) {
                return;
            }

            const o: number = proj(node.points.length);

            this.timers.push(
                setTimeout(() => {
                    this.ctxScatter!.fillStyle = colorize(s);
                    this.ctxScatter!.lineWidth = 1;
                    this.ctxScatter!.globalAlpha = 0.1 + 0.9 * o;
                    this.ctxScatter!.fillRect(
                        Math.min(l1.x, l2.x) + 0.2,
                        Math.min(l1.y, l2.y) + 0.2,
                        Math.abs(l2.x - l1.x) - 0.4,
                        Math.abs(l2.y - l1.y) - 0.4
                    );

                    this.progress.current?.next();
                    this.ctxScatter!.globalAlpha = 1;
                }, 0.02 * this.timers.length + 20)
            );
        });

        this.progress.current?.start(this.timers.length);
    }

};

export class SuperPixel {

    protected static area: { val: number; allocated: boolean; }[][] = [];
    protected static countReady: number = 0;
    protected static sps: SuperPixel[] = [];

    protected _children: Array<[number, number, number]>;

    public constructor(x: number, y: number) {
        this._children = [[x, y, SuperPixel.area[y][x].val]];
        SuperPixel.area[y][x].allocated = true;
        SuperPixel.countReady --;
        SuperPixel.sps.push(this);
    }

    public static loadArea(area: number[][]): void {
        SuperPixel.countReady = 0;
        SuperPixel.area = area.map(row => {
            return row.map(d => {
                if (d > 0) {
                    SuperPixel.countReady ++;
                }
                return {
                    val: d,
                    allocated: false
                };
            });
        });
        SuperPixel.sps = [];
    }

    public static grow(): void {
        while (SuperPixel.countReady) {
            SuperPixel.sps.forEach(sp => {
                sp.grow();
            });
        }
    }

    public get children() {
        return this._children;
    }

    public getBorders(): { x1: number; y1: number; x2: number; y2: number; }[] {
        let borders: { x1: number; y1: number; x2: number; y2: number; }[] = [];
        let border: { [id: string]: { x1: number; y1: number; x2: number; y2: number; }; } = {};

        this.children.forEach(child => {
            const lines = [{
                x1: child[0] * 2 - 1,
                y1: child[1] * 2 - 1,
                x2: child[0] * 2 + 1,
                y2: child[1] * 2 - 1
            }, {
                x1: child[0] * 2 + 1,
                y1: child[1] * 2 - 1,
                x2: child[0] * 2 + 1,
                y2: child[1] * 2 + 1
            }, {
                x1: child[0] * 2 - 1,
                y1: child[1] * 2 + 1,
                x2: child[0] * 2 + 1,
                y2: child[1] * 2 + 1
            }, {
                x1: child[0] * 2 - 1,
                y1: child[1] * 2 - 1,
                x2: child[0] * 2 - 1,
                y2: child[1] * 2 + 1
            }];

            lines.forEach(line => {
                const id: string = `${ line.x1 }:${ line.y1 }:${ line.x2 }:${ line.y2 }`;
                if (border[id]) {
                    delete border[id];
                } else {
                    border[id] = line;
                }
            });
        });

        for (const id in border) {
            if (border.hasOwnProperty(id)) {
                borders.push(border[id]);
            }
        }

        return borders;
    }

    public get value() {
        let aver: number = 0;
        this.children.forEach(child => {
            aver += child[2];
        });
        aver /= this.children.length;

        return aver;
    }

    protected grow(): boolean {
        const differ = (val: number, x: number, y: number) => {
            return Math.abs(val - this.value) + Math.sqrt(
                Math.pow(
                    x - this.children[0][0], 2
                ) + Math.pow(
                    y - this.children[0][1], 2
                )
            ) / 600;
        };

        let minDif: number = Infinity;
        let target: [number, number] | null = null;

        this._children.forEach(child => {
            // const biases = [
            //     [-1, -1], [0, -1], [1, -1],
            //     [-1, 0], [1, 0],
            //     [-1, 1], [0, 1], [1, 1]
            // ];
            const biases = [
                [0, -1], [-1, 0], [1, 0], [0, 1]
            ];

            for (let i: number = 0; i < biases.length; i++) {
                const pos: [number, number] = [child[0] + biases[i][0], child[1] + biases[i][1]];
                if (!(SuperPixel.area[pos[1]] && SuperPixel.area[pos[1]][pos[0]])) {
                    continue;
                }
                if (SuperPixel.area.length > pos[1] && SuperPixel.area[0].length > pos[0]) {
                    const val: number = SuperPixel.area[pos[1]][pos[0]].val;
                    if (val <= 0) {
                        continue;
                    }
                    if (!SuperPixel.area[pos[1]][pos[0]].allocated) {
                        const dif = differ(val, pos[0], pos[1]);
                        if (dif < minDif) {
                            minDif = dif;
                            target = pos;
                        }
                    }
                }
            }
        });
        
        if (target) {
            SuperPixel.area[target[1]][target[0]].allocated = true;
            SuperPixel.countReady --;
            this._children.push([
                target[0], target[1], SuperPixel.area[target[1]][target[0]].val
            ]);
        }

        return target || false;
    }

};

type HilbertNode = {
    code: string;
    points: Array<geodata>;
    childrens: Array<HilbertNode>;
};

type HilbertTreeNode = BinaryTreeNode<{
    code: string;
    points?: Array<geodata>;
    childrens?: Array<HilbertNode>;
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
export const eachHilbertNodes = (root: HilbertTreeNode, callback: (node: HilbertTreeNode) => (void | undefined)): void => {
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
                    code: rootCode,
                    points: data.map(d => d),
                    childrens: []
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
                code: rootCode,
                points: data.map(d => d),
                childrens: []
            }]
        }];
    }
};

/**
 * 获取邻近点.
 *
 * @param {Array<geodata>} total 结点列表
 * @param {number} idx 目标索引
 * @param {number} count 数量
 * @returns {Array<geodata>}
 */
export const getNeighbors = (total: Array<geodata>, idx: number, count: number): Array<geodata> => {
    let list: Array<geodata & { dist: number; }> = [];

    const code: string = total[idx].hilbertCode;

    const { lng, lat } = HilbertDecode(code);

    for (let j: number = Math.max(0, idx - count); j < Math.min(total.length, idx + count); j++) {
        if (j === idx) {
            continue;
        }
        list.push({
            id: total[j].id,
            lng: total[j].lng,
            lat: total[j].lat,
            dist: Math.pow(total[j].lng - lng, 2) + Math.pow(total[j].lat - lat, 2),
            hilbertCode: total[j].hilbertCode,
            value: total[j].value
        });
    }

    return list.sort((a, b) => a.dist - b.dist).slice(0, count);
};
