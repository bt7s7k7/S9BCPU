<template>
	<div class="output">
		<div v-for="(entry, index) in entries" :key="index" class="output-entry" v-if="allowed(entry.title)">
			<div class="row title">
				<div class="grow" v-html="entry.title"></div>
				<button
					v-for="(action, index) in entry.actions"
					:key="index"
					@click="action.action()"
				>{{ action.label }}</button>
			</div>
			<div v-if="entry.content" v-html="entry.content" class="content"></div>
		</div>
	</div>
</template>

<style>
	.output-entry {
		border-bottom: 1px solid #333333;
        width: 100%;
	}

	.output-entry > .title {
		background-color: #111111;
		padding: 4px;
	}

	.output-entry > .content {
		padding: 4px;
	}

    .output {
        overflow: auto;
        white-space: nowrap;
    }
</style>

<script lang="ts">
	import Vue from 'vue'
	import Component from "vue-class-component"
	import * as vueProp from "vue-property-decorator"

	export interface IEntry {
		title: string,
		actions: { label: string, action: () => void }[],
		content?: string
	}

	@Component
	export default class Output extends Vue {
		@vueProp.Prop(Array)
        readonly entries!: IEntry[]
        
        @vueProp.Prop(Array)
        readonly blacklist!: string[]

        allowed(title: string) {
            return !this.blacklist.some(v=>title.includes(v))
        }
	}
</script>