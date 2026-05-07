import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('HelloWorld')
export class HelloWorld extends Component {
    start() {
        console.log('Critter Clash è vivo!');
    }
}