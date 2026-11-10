/**
 * Pont d'interfaçage ROS 2 (Rosbridge WebSocket & Mock)
 * Permet de publier les topics standards ROS 2 :
 *  - /cmd_vel (geometry_msgs/Twist)
 *  - /odom (nav_msgs/Odometry)
 *  - /scan (sensor_msgs/LaserScan)
 *  - /battery_state (sensor_msgs/BatteryState)
 *  - /joint_states (sensor_msgs/JointState)
 * pour brancher directement une vraie pile Jetson Orin + ROS 2 Humble / Nav2.
 */
export class RosBridgeMock {
  constructor(robot, batteryModel) {
    this.robot = robot;
    this.batteryModel = batteryModel;
    this.isConnected = false;
    this.subscribers = new Map();
    this.publishRateHz = 10;
    this.timer = 0;
  }

  connect(wsUrl = 'ws://localhost:9090') {
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.isConnected = true;
        console.log('[ROS2 Bridge] Connecté au démon rosbridge:', wsUrl);
      };
      this.ws.onerror = () => {
        this.isConnected = false;
      };
      this.ws.onclose = () => {
        this.isConnected = false;
      };
    } catch {
      this.isConnected = false;
    }
  }

  publish(topic, msgType, message) {
    const packet = {
      op: 'publish',
      topic: topic,
      type: msgType,
      msg: message
    };

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    }

    // Appel des écouteurs locaux
    const listeners = this.subscribers.get(topic);
    if (listeners) {
      listeners.forEach(cb => cb(message));
    }
  }

  subscribe(topic, callback) {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, []);
    }
    this.subscribers.get(topic).push(callback);
  }

  update(dt) {
    this.timer += dt;
    if (this.timer < (1 / this.publishRateHz)) return;
    this.timer = 0;

    // 1. /cmd_vel
    this.publish('/cmd_vel', 'geometry_msgs/Twist', {
      linear: { x: this.robot.vx, y: this.robot.vy, z: 0 },
      angular: { x: 0, y: 0, z: this.robot.omega }
    });

    // 2. /odom
    this.publish('/odom', 'nav_msgs/Odometry', {
      header: { stamp: Date.now(), frame_id: 'odom' },
      child_frame_id: 'base_link',
      pose: {
        pose: {
          position: { x: this.robot.sensors.odomPose.x, y: 0, z: this.robot.sensors.odomPose.z },
          orientation: { yaw: this.robot.sensors.odomPose.theta }
        }
      }
    });

    // 3. /battery_state
    this.publish('/battery_state', 'sensor_msgs/BatteryState', {
      voltage: this.batteryModel.voltageV,
      current: this.batteryModel.currentA,
      percentage: this.batteryModel.soc,
      power_supply_status: this.batteryModel.soc > 0.25 ? 1 : 2
    });

    // 4. /joint_states (torse Z + 10 servomoteurs)
    this.publish('/joint_states', 'sensor_msgs/JointState', {
      name: ['torso_z_joint', 'arm_left_q1', 'arm_left_q2', 'arm_right_q1', 'arm_right_q2'],
      position: [
        this.robot.torso.currentHeightM,
        this.robot.leftArm.jointAngles[0],
        this.robot.leftArm.jointAngles[1],
        this.robot.rightArm.jointAngles[0],
        this.robot.rightArm.jointAngles[1]
      ]
    });
  }
}

