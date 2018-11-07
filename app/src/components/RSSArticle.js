import url from 'url';
import React from 'react';
import PropTypes from 'prop-types';
import ReactPlayer from 'react-player';
import isElectron from 'is-electron';
import { connect } from 'react-redux';

import fetch from '../util/fetch';
import { pinArticle, unpinArticle } from '../util/pins';
import { fetchSocialScore } from '../util/social';
import Tag from './Tag/Tag';
import Loader from './Loader';
import TimeAgo from './TimeAgo';
import HtmlRender from './HtmlRender';

import { ReactComponent as LinkIcon } from '../images/icons/link.svg';

function mergeSocialScore(article, socialScore) {
	article.socialScore = article.socialScore || {};
	for (const key of Object.keys(socialScore)) {
		article.socialScore[key] = Object.assign(
			{ score: article.socialScore[key] },
			socialScore[key],
		);
	}
	return article;
}

class RSSArticle extends React.Component {
	constructor(props) {
		super(props);

		this.resetState = {
			error: false,
			loading: true,
			loadingContent: true,
			article: {},
		};

		this.state = { ...this.resetState };

		this.sentArticleReadCompleteAnalyticsEvent = false;
		this.contentRef = React.createRef();
	}

	componentDidMount() {
		const articleID = this.props.match.params.articleID;
		window.streamAnalyticsClient.trackEngagement({
			label: 'article_open',
			content: { foreign_id: `articles:${articleID}` },
		});

		this.getArticle(articleID);
		this.getRSSContent(articleID);
	}

	componentDidUpdate(prevProps) {
		const articleID = this.props.match.params.articleID;

		if (articleID !== prevProps.match.params.articleID) {
			this.setState({ ...this.resetState });
			this.sentArticleReadCompleteAnalyticsEvent = false;

			window.streamAnalyticsClient.trackEngagement({
				label: 'article_open',
				content: { foreign_id: `articles:${articleID}` },
			});

			this.getArticle(articleID);
			this.getRSSContent(articleID);
		}

		const contentEl = this.contentRef.current;
		if (contentEl) {
			contentEl.onscroll = () => {
				const scrollPercentage =
					contentEl.scrollTop /
					(contentEl.scrollHeight - contentEl.clientHeight);
				if (
					!this.sentArticleReadCompleteAnalyticsEvent &&
					scrollPercentage > 0.8
				) {
					window.streamAnalyticsClient.trackEngagement({
						label: 'article_read_complete',
						content: {
							foreign_id: `articles:${articleID}`,
						},
					});
					this.sentArticleReadCompleteAnalyticsEvent = true;
				}
			};
		}
	}

	tweet = () => {
		const location = url.parse(window.location.href);
		const link = {
			protocol: 'https',
			hostname: 'winds.getstream.io',
			pathname: location.pathname,
		};
		if (location.pathname === '/' && location.hash) {
			link.pathname = location.hash.slice(1);
		}
		const shareUrl = `https://twitter.com/intent/tweet?url=${url.format(link)}&text=${
			this.state.article.title
		}&hashtags=Winds,RSS`;

		if (isElectron()) {
			window.ipcRenderer.send('open-external-window', shareUrl);
		} else {
			const getWindowOptions = function() {
				const width = 500;
				const height = 350;
				const left = window.innerWidth / 2 - width / 2;
				const top = window.innerHeight / 2 - height / 2;

				return [
					'resizable,scrollbars,status',
					'height=' + height,
					'width=' + width,
					'left=' + left,
					'top=' + top,
				].join();
			};

			const win = window.open(shareUrl, 'Share on Twitter', getWindowOptions());
			win.opener = null;
		}
	};

	getArticle = async (articleID) => {
		try {
			this.setState({ loading: true });
			const res = await fetch('GET', `/articles/${articleID}`);
			this.setState({ article: res.data, loading: false });

			const [reddit, hackernews] = await Promise.all([
				fetchSocialScore('reddit', res.data),
				fetchSocialScore('hackernews', res.data),
			]);

			this.setState({
				article: mergeSocialScore(res.data, { reddit, hackernews }),
			});
		} catch (err) {
			console.log(err); // eslint-disable-line no-console
		}
	};

	getRSSContent = (articleId) => {
		this.setState({ loadingContent: true });

		fetch('GET', `/articles/${articleId}`, {}, { type: 'parsed' })
			.then((res) => {
				this.setState({ loadingContent: false, ...res.data });
			})
			.catch(() => {
				this.setState({
					error: true,
					errorMessage: 'There was a problem loading this article. :(',
					loadingContent: false,
				});
			});
	};

	render() {
		if (this.state.loading) return <Loader />;

		const article = this.state.article;
		const dispatch = this.props.dispatch;

		const redditDataAvailable =
			article.socialScore &&
			article.socialScore.reddit &&
			article.socialScore.reddit.url;
		const hackernewsDataAvailable =
			article.socialScore &&
			article.socialScore.hackernews &&
			article.socialScore.hackernews.url;

		const pinID = this.props.pinnedArticles[article._id]
			? this.props.pinnedArticles[article._id]._id
			: null;

		let articleContents;

		if (this.state.loadingContent) {
			articleContents = <Loader />;
		} else if (this.state.error) {
			articleContents = (
				<div>
					<p>There was a problem loading this article :(</p>
					<p>To read the article, head on over to:</p>
					<p>
						<a href={article.url} rel="noopener noreferrer" target="_blank">
							{article.title}
						</a>
					</p>
				</div>
			);
		} else {
			articleContents = (
				<HtmlRender
					content={this.state.content}
					id={article._id}
					type="article"
				/>
			);
		}

		return (
			<React.Fragment>
				<div className="content-header">
					<h1>{article.title}</h1>
					<div className="item-info">
						<TimeAgo className="muted" timestamp={article.publicationDate} />
						<a href={article.url}>
							<LinkIcon />
						</a>
						<span
							className="clickable"
							onClick={() =>
								pinID
									? unpinArticle(pinID, article._id, dispatch)
									: pinArticle(article._id, dispatch)
							}
						>
							<i className={`${pinID ? 'fas' : 'far'} fa-bookmark`} />
						</span>
						<span className="clickable" onClick={this.tweet}>
							<i className="fab fa-twitter" />
						</span>
						{redditDataAvailable && (
							<a
								href={article.socialScore.reddit.url}
								rel="noopener noreferrer"
								target="_blank"
							>
								{article.socialScore.hackernews.score}
								<i className="fab fa-reddit-alien" />
							</a>
						)}
						{hackernewsDataAvailable && (
							<a
								href={article.socialScore.hackernews.url}
								rel="noopener noreferrer"
								target="_blank"
							>
								{article.socialScore.hackernews.score}

								<i className="fab fa-hacker-news-square" />
							</a>
						)}
						{article.commentUrl && (
							<a href={article.commentUrl}>
								<i className="fas fa-comment" />
							</a>
						)}
						<Tag feedId={article._id} type="article" />
					</div>
				</div>

				<div className="content" ref={this.contentRef}>
					<div className="enclosures">
						{article.enclosures &&
							article.enclosures.map(
								(enclosure) =>
									enclosure.type.includes('audio') ||
									enclosure.type.includes('video') ||
									(enclosure.type.includes('youtube') && (
										<ReactPlayer
											controls={true}
											key={enclosure._id}
											url={enclosure.url}
										/>
									)),
							)}
					</div>
					{articleContents}
				</div>
			</React.Fragment>
		);
	}
}

RSSArticle.propTypes = {
	dispatch: PropTypes.func.isRequired,
	pinnedArticles: PropTypes.shape({}),
	match: PropTypes.shape({
		params: PropTypes.shape({
			articleID: PropTypes.string.isRequired,
			rssFeedID: PropTypes.string,
		}),
	}),
};

const mapStateToProps = (state) => ({ pinnedArticles: state.pinnedArticles || {} });

export default connect(mapStateToProps)(RSSArticle);
