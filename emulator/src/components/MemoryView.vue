<template>
	<div class="memory-view" @resize="calcHeight" ref="root" @mousewheel.prevent="onScroll">
		<div v-for="(text, index) in viewValues" :key="index" class="memory-view-entry" v-html="text"></div>
	</div>
</template>

<style>
	.memory-view {
        overflow: hidden;
        overflow-x: scroll;
		padding: 4px;
	}

	.memory-view-entry {
		border-bottom: 1px solid #111111;
    }
    
    .memory-view-annotation {
        background-color: #050505;
    }
</style>

<script lang="ts">
	import Vue from 'vue'
	import Component from "vue-class-component"
	import * as vueProp from "vue-property-decorator"
	import { Memory } from '../CPU/base';
	import { debugStatement, Statement } from 's9b-compiler';

	@Component
	export default class MemoryView extends Vue {
		@vueProp.Prop()
		readonly memory!: Memory;
		index = 0
		amount = 0

        mounted() {
            this.calcHeight()
        }

		public get viewValues() {
			this.calcHeight()

			let lookup = this.memory.lastAssembly?.lookup ?? {}
			let values = this.memory.data.slice(this.index, Math.min(this.index + this.amount, this.memory.data.length))

			let ret = [] as string[]

			let lastStatement = null as Statement | null
			values.forEach((v, i) => {
				let realIndex = i + this.index
				let statement = lookup[realIndex]
				if (statement && statement != lastStatement) {
					ret.push(`<div class="memory-view-annotation">` + debugStatement(statement, true) + `</div>`)
					lastStatement = statement
                }
                
                var classes = [] as string[]

				ret.push(`<div class="${classes.join(" ")}">${`${realIndex.toString().padStart(3, "\xa0")}:`.fontcolor("grey")} ${`${v} 0x${v.toString(16)}`.fontcolor("crimson")} ${JSON.stringify(String.fromCharCode(v)).fontcolor("lightgreen")}</div>`)
			})

			return ret
		}


		calcHeight() {
			let target = this.$refs.root as HTMLDivElement
			if (!target) return
			let height = target.clientHeight
			this.amount = Math.floor(height / 17)
		}

		onScroll(event: MouseWheelEvent) {
			this.index += Math.floor(event.deltaY / 25)
			if (this.index < 0) this.index = 0
			if (this.index >= this.memory.data.length) this.index = this.memory.data.length - 1
		}
	}
</script>