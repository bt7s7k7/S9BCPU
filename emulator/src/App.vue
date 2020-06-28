<template>
	<div id="app" class="fill">
		<div class="fill row">
			<div class="col" style="flex-basis: 230px">
				<div class="border-top row">
					<button @click="tick">T</button>
					<button @click="enable">E</button>
					<button @click="disable">D</button>
					<button @click="reset">R</button>
					<div class="toggle">
						<input type="checkbox" name="clock" id="clock" v-model="clock" />
					</div>
					<div>
						<button v-if="clockLevel == 0" @click="clockLevel = 1">
							<span class="green">></span>
							<span class="white">>></span>
						</button>
						<button v-if="clockLevel == 1" @click="clockLevel = 2">
							<span class="green">>></span>
							<span class="white">></span>
						</button>
						<button v-if="clockLevel == 2" @click="clockLevel = 0">
							<span class="green">>>></span>
						</button>
					</div>
				</div>
				<div style="flex-basis: 200px" class="cpu-info" v-html="cpuInfo"></div>
				<MemoryView
					class="grow border-top contain"
					:memory="cpu.components.memory"
					:stackPtr="cpu.components.stackRegister.value"
				></MemoryView>
			</div>
			<div class="grow row border-left">
				<CodeEditor class="grow relative contain" @build="onBuild($event)" :line="line"></CodeEditor>
				<div class="border-left col grow contain">
					<Output class="grow border-top" :entries="outputEntries" :blacklist="blacklist"></Output>
					<div class="row">
						<button @click="clear">Clear</button>
						<div class="toggle">
							<input type="checkbox" v-model="buildDebug" name="buildDebug" id="buildDebug" />
							<label for="buildDebug">Debug Info</label>
						</div>
						<div class="toggle">
							<input type="checkbox" v-model="showInt" name="showInt" id="showInt" />
							<label for="showInt">Intermediate</label>
						</div>
						<div class="toggle">
							<input type="checkbox" v-model="showRun" name="showRun" id="showRun" />
							<label for="showRun">Runtime</label>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue'
	import Component from "vue-class-component"
	import * as vueProp from "vue-property-decorator"
	import { IEntry } from './components/Output.vue'
	import { IAssembledOutput, debugStatement, Statement } from 's9b-compiler'
	import { S9BCPU } from "./CPU/s9b"
	import "./assets/main.css"
	// @ts-ignore
	import vueInterval from "vue-interval/dist/VueInterval.common"

	window.addEventListener("keydown", (event) => {
		if (event.ctrlKey && event.code == "KeyS") event.preventDefault()
	})

	@Component({
		components: {
			CodeEditor: () => import("./components/CodeEditor.vue"),
			Output: () => import("./components/Output.vue"),
			MemoryView: () => import("./components/MemoryView.vue")
		},
		mixins: [vueInterval]
	})
	export default class App extends Vue {
		outputEntries: IEntry[] = []
		cpu = new S9BCPU(2 ** 9)
		buildDebug = false
		showInt = false
		showRun = false
		clock = false
		clockLevel = 0
		clockLevels = [100, 10, 1]
		lastClockTick = Date.now()

		get tickPeriod() { return this.clockLevels[this.clockLevel] }

		log(entry: IEntry) {
			this.outputEntries.unshift(entry)
		}

		onBuild(result: IAssembledOutput) {
			var lastStatement = null as Statement | null
			var content = this.buildDebug ? (result.binOut.length > 0 ? result.binOut.map((v, i) => {
				let statement = result.lookup[i]
				if (!statement || lastStatement == statement) {
					return `${i}: ${v}`
				} else {
					lastStatement = statement
					return `${debugStatement(statement, true)} at ${statement.span.from.line + 1}:${statement.span.to.ch}<br>${i}: ${v} `
				}
			}).join("<br>") : result.statements.map(
				v => `${debugStatement(v, true)} at ${v.span.from.line + 1}:${v.span.to.ch}`
			).join("<br>")) : ""
			if (result.errors.length > 0) {
				this.log({ title: `<span style="color: lightsalmon">[ERR] ${result.errors.map(v => v.text).join("<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;")}</span>`, actions: [], content })
			} else {
				this.log({
					title: `Compilation successful`.fontcolor("lightgreen"),
					actions: [],
					content
				})

				this.cpu.components.memory.loadFromAssembly(result)
			}
		}

		mounted() {
			this.showInt = localStorage.getItem("s9b-showInt") == "true"
			this.showRun = localStorage.getItem("s9b-showRun") == "true"
			this.buildDebug = localStorage.getItem("s9b-buildDebug") == "true"
		}

		@vueProp.Watch("buildDebug")
		onBuildDebugChange() {
			localStorage.setItem("s9b-buildDebug", this.buildDebug ? "true" : "false")
		}

		@vueProp.Watch("showInt")
		onShowIntChange() {
			localStorage.setItem("s9b-showInt", this.showInt ? "true" : "false")
		}

		@vueProp.Watch("showRun")
		onShowRunChange() {
			localStorage.setItem("s9b-showRun", this.showRun ? "true" : "false")
		}

		public get cpuInfo(): string {
			return this.cpu.getInfo()
		}

		public get blacklist() {
			var ret = [] as string[]
			if (!this.showInt) ret.push("[INT]")
			if (!this.showRun) ret.push("[RUN]")
			return ret
		}

		tick() {
			var result = this.cpu.tick()
			result.messages.forEach(v => this.log({ title: v, actions: [] }))
		}

		enable() {
			this.cpu.running = true
		}

		disable() {
			this.cpu.running = false
		}

		reset() {
			this.cpu.reset()
		}

		INTERVAL__1$tick() {
			if (this.clock) {
				if (Date.now() - this.lastClockTick > this.tickPeriod) {
					this.tick()
					this.lastClockTick = Date.now()
				}
			}
		}


		public get line() {
			let address = this.cpu.components.pc.value
			let statement = this.cpu.components.memory.lastAssembly?.lookup?.[address]
			if (!statement) return -1

			return statement.span.from.line
		}

		clear() {
			this.outputEntries = []
		}
	}
</script>