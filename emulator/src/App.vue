<template>
	<div id="app" class="fill">
		<div class="fill row">
			<div class="col">
				<div style="flex-basis: 200px" class="cpu-info" v-html="cpuInfo"></div>
                <MemoryView class="grow border-top contain" :memory="cpu.components.memory"></MemoryView>
			</div>
			<div class="grow row border-left">
				<CodeEditor class="grow relative contain" @build="onBuild($event)"></CodeEditor>
				<div class="border-left col grow contain">
					<Output class="grow border-top" :entries="outputEntries"></Output>
					<div>
						<div class="toggle">
							<input type="checkbox" v-model="buildDebug" name="buildDebug" id="buildDebug" />
							<label for="buildDebug" @mousedown.prevent>Build Debug Info</label>
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

	window.addEventListener("keydown", (event) => {
		if (event.ctrlKey && event.code == "KeyS") event.preventDefault()
	})

	@Component({
		components: {
			CodeEditor: () => import("./components/CodeEditor.vue"),
			Output: () => import("./components/Output.vue"),
			MemoryView: () => import("./components/MemoryView.vue")
		}
	})
	export default class App extends Vue {
		outputEntries: IEntry[] = []
		cpu = new S9BCPU(2 ** 9)
		buildDebug = false

		log(entry: IEntry) {
			this.outputEntries.unshift(entry)
		}

		onBuild(result: IAssembledOutput) {
			var lastStatement = null as Statement | null
			var content = this.buildDebug ? result.binOut.map((v, i) => {
				let statement = result.lookup[i]
				if (!statement || lastStatement == statement) {
					return `${i}: ${v}`
				} else {
					lastStatement = statement
					return `${debugStatement(statement, true)} at ${statement.span.from.line + 1}:${statement.span.to.ch}<br>${i}: ${v} `
				}
			}).join("<br>") : ""
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


		public get cpuInfo(): string {
			return this.cpu.getInfo()
		}

	}
</script>