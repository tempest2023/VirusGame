"use strict";
// require("three.js");
/**
 * [Virus 病毒 base class]
 * @param       {[str]} id       [病毒编号,负责定位病毒]
 * @param       {[str]} type     [病毒种类,决定病毒视图样子]
 * @param       {[array]} location [病毒位置,决定病毒在游戏中的空间位置]
 * @param       {[obj]} option   [游戏相关参数]
 * @constructor
 */
function Virus(id, type, location, option = {
  reproduce: 60,
  category: 0,
  reproduceFactor: 1,
  reproduceSize: 90,
  speedFactor: 1,
  defendFactor: 1,
  scene: undefined,
  font: undefined,
  sprite: undefined
}) {
  if (id === undefined || type === undefined || location === undefined) {
    console.error(id, type, location);
    throw Error('缺少确切参数');
  }
  this.id = id;
  this.type = type;
  this.location = location;
  this.option = option;

  if (this.option.font === undefined) {
    throw Error('缺少字体文件');
  }

  if (this.option.sprite === undefined) {
    throw Error('缺少粒子材质');
  }

  // 病毒参数(variable)
  this.reproduce = option.reproduce;
  this.category = option.category || 0; // '0' means no category, '1' means player 1, '2' means player 2.
  this.operation = []; // 玩家操作记录

  // 病毒参数(constant)
  this.reproduceSize = option.reproduceSize || 90; //繁殖上限
  this.reproduceFactor = option.reproduceFactor || 1; //繁殖系数
  this.speedFactor = option.speedFactor || 1; //速度系数
  this.defendFactor = option.defendFactor || 1; //防御系数

  createViewByType(this, type, location, option);
  createFont(this, type, location, option);
  // callable methods

  this.updateTextView = function() {
    let textGeometry = new THREE.TextGeometry(this.reproduce.toString(), {
      font: this.option.font,
      size: 14,
      height: 1,
      curveSegments: 10,
      bevelEnabled: false
    });
    let textMaterial = new THREE.MeshPhongMaterial({color: 0x000000, flatShading: true});
    let textMesh = new THREE.Mesh(textGeometry, textMaterial);
    let textLocation = adjustTextLocation(this.location, this.reproduce);

    textMesh.position.set(...textLocation);
    textMesh.name = 'text_' + this.id;
    let scene = this.text.parent;
    scene.remove(this.text);
    scene.add(textMesh);
    this.text = textMesh;
  }

  this.removeView = function() {
    this.option.scene.remove(this.mesh);
    this.option.scene.remove(this.text);
  }

  this.updateLocation = function(location) {
    this.location = location;
    this.mesh.position.set(...location);
    let textLocation = adjustTextLocation(location, this.reproduce);
    this.text.position.set(...textLocation);
  }

  this.updateReproduce = function(num, isPlus) {
    let old = this.reproduce;
    if (isPlus) {
      // 增加
      this.reproduce += num;
    } else {
      // 减少
      this.reproduce -= num;
      if (this.reproduce < 0) {
        this.reproduce = -this.reproduce;
      }
    }
    // 超限
    if (this.reproduce > this.reproduceSize) {
      this.reproduce = this.reproduceSize;
    }
    // 更新视图部分
    if (old !== this.reproduce) {
      this.updateTextView();
    }
  }

  this.updateCategory = function(category) {
    this.category = category;
    // update view
    let material = new THREE.MeshLambertMaterial({color: playerColor[category], shininess: 12, transparent: true, opacity: 0.9});
    let mesh = new THREE.Mesh(this.geometry, material);

    mesh.position.set(...this.location);
    mesh.name = this.id;
    this.material = material;

    let scene = this.mesh.parent;
    scene.remove(this.mesh);
    scene.add(mesh);
    this.mesh = mesh;
  }

  this.selfReproduce = function() {
    // 没有派系的病毒不能增殖
    if (this.category != 0) {
      this.updateReproduce(this.reproduceFactor, true);
    }
  }

  this.attack = function(target) {
    if (!(target instanceof Virus)) {
      throw Error('攻击对象必须是Virus');
    }
    // attack outward
    let attackNum = this.reproduce - parseInt(this.reproduce / 2, 10);
    this.updateReproduce(attackNum, false);

    // 计算路径点
    let startPoint = [...this.location];
    // 维护 attack 粒子路径
    var spriteGroup = new THREE.Group();
    for (let i = 0; i < 10 * attackNum; i++) {
      let sprite = new THREE.Sprite(this.option.sprite);
      const k1 = Math.random() - 0.5;
      const k2 = Math.random() - 0.5;
      const k3 = Math.random() - 0.5;
      // 控制精灵大小，比如可视化中精灵大小表征数据大小
      sprite.scale.set(5, 5, 1); //// 只需要设置x、y两个分量就可以

      sprite.position.set(10 * k1, 10 * k2, 10 * k3);
      spriteGroup.add(sprite);
    }
    if (this.option.scene) {
      this.option.scene.add(spriteGroup);
    }
    //计算进攻路径点
    let attackPoints = [];
    let attackTime = parseInt(this.distance(target) / this.speedFactor / 1000);
    let xStep = (target.location[0] - startPoint[0]) / attackTime;
    let yStep = (target.location[1] - startPoint[1]) / attackTime;
    let zStep = (target.location[2] - startPoint[2]) / attackTime;
    for (let i = 0; i < attackTime; i++) {
      attackPoints.push([
        startPoint[0] + xStep * i,
        startPoint[1] + yStep * i,
        startPoint[2] + zStep * i
      ]);
    }
    let attackParams = {
      attacker: this,
      spriteGroup: spriteGroup,
      attackNum: attackNum,
      target: target,
      category: this.category,
      attackPoints: attackPoints
    };
    return attackParams;
  }

  this.sufferInvading = function(num, category) {
    if (category == this.category) {
      // help friends
      this.updateReproduce(num, true);
    } else {
      let realAttack = parseInt(num / this.defendFactor, 10);
      if (this.reproduce < realAttack) {
        // change category
        this.updateCategory(category);
      }
      this.updateReproduce(realAttack, false);
    }
  }

  this.distance = function(virus) {
    if (!(virus instanceof Virus)) {
      throw Error('Can not return distance for another entity ewhich is not virus.');
    }
    let l1 = this.location;
    let l2 = virus.location;
    return Math.pow(l1[0] - l2[0], 2) + Math.pow(l1[1] - l2[1], 2) + Math.pow(l1[2] - l2[2], 2);
  }

  // 维护攻击粒子动画
  this.attackTarget = (spriteGroup, target, attackNum, category, attackPoints) => {
    if (attackPoints.length == 0) {
      target.sufferInvading(attackNum, category);
      spriteGroup.parent.remove(spriteGroup);
      return true;
    } else {
      //到达下一个路径点
      let nextPoint = attackPoints.shift();
      spriteGroup.position.x = nextPoint[0];
      spriteGroup.position.y = nextPoint[1];
      spriteGroup.position.z = nextPoint[2];
    }
    return false;
  }

}
//根据reproduce数字调整显示文本的位置使其居中
function adjustTextLocation(location, reproduce) {
  let tmp = [...location];
  tmp[0] -= 7;
  tmp[1] -= 7;
  if (reproduce >= 10 && reproduce < 100) {
    tmp[0] -= 3;
  } else if (reproduce >= 100) {
    tmp[0] -= 8;
  }
  return tmp;
}

// 创建病毒视图
function createViewByType(obj, type, location, option) {
  let radius = option.radius || 20;
  let density = option.density || 20;
  let geometry = new THREE.SphereGeometry(radius, density, density);

  let material = new THREE.MeshLambertMaterial({
    color: playerColor[obj.category],
    shininess: 12,
    transparent: true,
    opacity: 0.9
  });
  let mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(...location);
  mesh.name = obj.id;
  obj.geometry = geometry;
  obj.material = material;
  obj.mesh = mesh;
  if (obj.option.scene !== undefined) {
    obj.option.scene.add(obj.mesh);
  }
}

// 创建病毒上的文本视图
function createFont(obj) {
  let textGeometry = new THREE.TextGeometry(obj.reproduce.toString(), {
    font: obj.option.font,
    size: 14,
    height: 1,
    curveSegments: 10,
    bevelEnabled: false
  });

  let textMaterial = new THREE.MeshPhongMaterial({color: 0x000000, flatShading: true});
  let textMesh = new THREE.Mesh(textGeometry, textMaterial);
  let textLocation = adjustTextLocation(obj.location, obj.reproduce);
  textMesh.position.set(...textLocation);
  textMesh.name = 'text_' + obj.id;
  obj.text = textMesh;
  if (obj.option.scene !== undefined) {
    obj.option.scene.add(obj.text);
  }
}

// 玩家类别与病毒颜色
var playerColor = {
  '0': 0x9DA1AC,
  '1': 0x6FD4EE,
  '2': 0xDE9A5B,
  '3': 0x57D783
};
